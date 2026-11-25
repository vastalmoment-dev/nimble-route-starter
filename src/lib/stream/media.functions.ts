import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { StreamType, SubtitleTrack } from "./resolver";

const STREAM_ORIGIN = "https://vidsrc.buzz";
const FALLBACK_EMBED_ORIGIN = "https://vidlink.pro";

const STREAM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: "https://www.2embed.cc/",
  Accept: "*/*",
};

export interface MediaStreamResult {
  ok: boolean;
  streamUrl: string | null;
  type: StreamType;
  provider: string;
  subtitles: SubtitleTrack[];
  embedUrl: string | null;
  error?: string;
}

const MediaStreamInputSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  imdbId: z
    .string()
    .regex(/^tt\d{5,10}$/)
    .nullable()
    .optional(),
  tmdbId: z
    .string()
    .regex(/^\d{1,10}$/)
    .nullable()
    .optional(),
  season: z.number().int().min(1).max(100).default(1),
  episode: z.number().int().min(1).max(2000).default(1),
});

interface EmbeddedQ {
  t?: string;
  ssr?: {
    servers?: { ref?: string; name?: string; lang?: string | null }[];
  };
}

function buildFallbackEmbedUrl(params: {
  mediaType: "movie" | "tv";
  imdbId?: string | null | undefined;
  tmdbId?: string | null | undefined;
  season: number;
  episode: number;
}): string | null {
  if (params.tmdbId) {
    return params.mediaType === "movie"
      ? `${FALLBACK_EMBED_ORIGIN}/movie/${params.tmdbId}`
      : `${FALLBACK_EMBED_ORIGIN}/tv/${params.tmdbId}/${params.season}/${params.episode}`;
  }
  if (params.imdbId) {
    return params.mediaType === "movie"
      ? `${STREAM_ORIGIN}/embed/movie/${params.imdbId}`
      : `${STREAM_ORIGIN}/embed/tv/${params.imdbId}/${params.season}/${params.episode}`;
  }
  return null;
}

function scoreServer(name: string | undefined, lang: string | null | undefined): number {
  const n = (name ?? "").toLowerCase();
  const l = (lang ?? "").toLowerCase();
  let score = 0;
  if (l === "english" || n.includes("english")) score += 50;
  if (n.includes("vrs2")) score += 30;
  else if (n.includes("vrh1")) score += 25;
  else if (n.includes("vrs1")) score += 20;
  else if (n.includes("swm1")) score += 15;
  else if (n.includes("vnr")) score += 10;
  return score;
}

function isEnglishSub(track: { label?: string; lang?: string; cc?: string }): boolean {
  const s = `${track.label ?? ""} ${track.lang ?? ""} ${track.cc ?? ""}`.toLowerCase();
  return s.includes("english") || s === "en" || s.includes(" us");
}

export const getMediaStream = createServerFn({ method: "GET" })
  .inputValidator((input) => MediaStreamInputSchema.parse(input))
  .handler(async ({ data }): Promise<MediaStreamResult> => {
    const lookupId = data.imdbId || data.tmdbId;
    const embedUrl = buildFallbackEmbedUrl(data);

    if (!lookupId) {
      return {
        ok: false,
        streamUrl: null,
        type: "hls",
        provider: "SHADOW Stream",
        subtitles: [],
        embedUrl,
        error: "Playback identifier is unavailable for this title.",
      };
    }

    const pageUrl =
      data.mediaType === "movie"
        ? `${STREAM_ORIGIN}/embed/movie/${lookupId}`
        : `${STREAM_ORIGIN}/embed/tv/${lookupId}/${data.season}/${data.episode}`;

    try {
      const htmlRes = await fetch(pageUrl, {
        headers: STREAM_HEADERS,
        signal: AbortSignal.timeout(7000),
      });
      if (!htmlRes.ok) {
        return {
          ok: false,
          streamUrl: null,
          type: "hls",
          provider: "SHADOW Stream",
          subtitles: [],
          embedUrl,
          error: "Alternate player ready.",
        };
      }

      const html = await htmlRes.text();
      const qMatch = /var Q = (\{.*?\});\s*var \$=/s.exec(html);
      if (!qMatch) {
        return {
          ok: false,
          streamUrl: null,
          type: "hls",
          provider: "SHADOW Stream",
          subtitles: [],
          embedUrl,
          error: "Alternate player ready.",
        };
      }

      const q = JSON.parse(qMatch[1]!) as EmbeddedQ;
      let servers = (q.ssr?.servers ?? []).filter(
        (s): s is { ref: string; name?: string; lang?: string | null } => Boolean(s.ref),
      );

      if (!servers.length && q.t) {
        const srcUrl =
          data.mediaType === "movie"
            ? `${STREAM_ORIGIN}/pl/api.php?a=sources&type=movie&id=${encodeURIComponent(lookupId)}&t=${encodeURIComponent(q.t)}`
            : `${STREAM_ORIGIN}/pl/api.php?a=sources&type=tv&id=${encodeURIComponent(lookupId)}&s=${data.season}&e=${data.episode}&t=${encodeURIComponent(q.t)}`;
        const srcRes = await fetch(srcUrl, {
          headers: { ...STREAM_HEADERS, Referer: pageUrl },
          signal: AbortSignal.timeout(6000),
        });
        if (srcRes.ok) {
          const srcJson = (await srcRes.json()) as {
            servers?: { ref?: string; name?: string; lang?: string | null }[];
          };
          servers = (srcJson.servers ?? []).filter(
            (s): s is { ref: string; name?: string; lang?: string | null } => Boolean(s.ref),
          );
        }
      }

      servers.sort((a, b) => scoreServer(b.name, b.lang) - scoreServer(a.name, a.lang));

      let resolvedStreamId: string | null = null;
      for (const srv of servers.slice(0, 5)) {
        try {
          const playRes = await fetch(
            `${STREAM_ORIGIN}/pl/api.php?a=play&ref=${encodeURIComponent(srv.ref)}`,
            {
              headers: { ...STREAM_HEADERS, Referer: pageUrl },
              signal: AbortSignal.timeout(5500),
            },
          );
          if (!playRes.ok) continue;
          const play = (await playRes.json()) as { url?: string; type?: string };
          const idMatch = /_stream\?id=([a-zA-Z0-9_-]{8,128})/.exec(play.url ?? "");
          if (idMatch?.[1]) {
            resolvedStreamId = idMatch[1];
            break;
          }
        } catch {
          /* try next mirror */
        }
      }

      if (!resolvedStreamId) {
        return {
          ok: false,
          streamUrl: null,
          type: "hls",
          provider: "SHADOW Stream",
          subtitles: [],
          embedUrl,
          error: "Using alternate player for this title.",
        };
      }

      let subtitles: SubtitleTrack[] = [];
      if (q.t) {
        try {
          const subQuery =
            data.mediaType === "movie"
              ? `type=movie&id=${encodeURIComponent(lookupId)}&t=${encodeURIComponent(q.t)}`
              : `type=tv&id=${encodeURIComponent(lookupId)}&s=${data.season}&e=${data.episode}&t=${encodeURIComponent(q.t)}`;
          const subRes = await fetch(`${STREAM_ORIGIN}/pl/api.php?a=subs&${subQuery}`, {
            headers: { ...STREAM_HEADERS, Referer: pageUrl },
            signal: AbortSignal.timeout(4500),
          });
          if (subRes.ok) {
            const subJson = (await subRes.json()) as {
              subs?: { label?: string; lang?: string; cc?: string; ref?: string }[];
            };
            subtitles = (subJson.subs ?? [])
              .filter((s): s is { label?: string; lang?: string; cc?: string; ref: string } =>
                Boolean(s.ref && /^[A-Za-z0-9._~=-]{10,1024}$/.test(s.ref)),
              )
              .sort((a, b) => Number(isEnglishSub(b)) - Number(isEnglishSub(a)))
              .slice(0, 12)
              .map((s) => ({
                url: `/api/media/sub?ref=${encodeURIComponent(s.ref)}`,
                lang: s.cc || s.lang || "en",
                label: s.label || s.lang || "Subtitles",
              }));
          }
        } catch {
          /* subtitles optional */
        }
      }

      return {
        ok: true,
        streamUrl: `/api/media/hls?id=${encodeURIComponent(resolvedStreamId)}`,
        type: "hls",
        provider: "SHADOW Stream",
        subtitles,
        embedUrl,
      };
    } catch (error) {
      console.error("Media stream resolution failed", error);
      return {
        ok: false,
        streamUrl: null,
        type: "hls",
        provider: "SHADOW Stream",
        subtitles: [],
        embedUrl,
        error: "Stream temporarily unavailable.",
      };
    }
  });
