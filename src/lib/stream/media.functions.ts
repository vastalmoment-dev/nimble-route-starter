import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { signMediaProxyUrl } from "./media-proxy";
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
  lang: z.enum(["en", "fr"]).default("en"),
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

function scoreServer(
  name: string | undefined,
  lang: string | null | undefined,
  prefLang: "en" | "fr",
): number {
  const n = (name ?? "").toLowerCase();
  const l = (lang ?? "").toLowerCase();
  let score = 0;

  const isFrench = l.includes("french") || l === "fr" || n.includes("french");
  const isEnglish = l.includes("english") || l === "en" || n.includes("english");
  const isMkvOrMp4 = n.includes("mp4") || n.includes("vnz");

  if (prefLang === "fr") {
    if (isFrench) score += 200;
    else if (isEnglish || l === "") score += 40;
  } else {
    if (isEnglish) score += 120;
    else if (l === "") score += 50;
  }

  // Prefer HLS streams (VRH1, VRS2, VRS1, XPK) over MP4/MKV so hls.js and offline downloader succeed everywhere.
  if (n.includes("vrh1")) score += 40;
  else if (n.includes("vrs2")) score += 35;
  else if (n.includes("vrs1")) score += 30;
  else if (n.includes("xpk")) score += 25;
  else if (n.includes("swm1")) score += 18;
  else if (n.includes("vnr")) score += 12;
  else if (n.includes("vny")) score += 8;
  else if (isMkvOrMp4) score += 4;

  return score;
}

function isPreferredSub(
  track: { label?: string; lang?: string; cc?: string },
  prefLang: "en" | "fr",
): number {
  const s = `${track.label ?? ""} ${track.lang ?? ""} ${track.cc ?? ""}`.toLowerCase();
  const cc = (track.cc ?? "").toLowerCase();
  if (prefLang === "fr") {
    if (cc === "fr" || s.includes("french") || s.includes("français")) return 3;
    if (cc === "en" || s.includes("english")) return 2;
    return 0;
  }
  if (cc === "en" || s.includes("english") || s.includes(" us")) return 3;
  if (cc === "fr" || s.includes("french")) return 1;
  return 0;
}

async function verifyPlayableStream(
  rawUrl: string,
  hintType?: string,
): Promise<{ proxiedUrl: string; streamType: StreamType } | null> {
  const streamMatch = /_stream\?id=([a-zA-Z0-9_-]{8,128})/.exec(rawUrl);
  if (streamMatch?.[1]) {
    const checkUrl = `${STREAM_ORIGIN}/_stream?id=${encodeURIComponent(streamMatch[1])}`;
    try {
      const check = await fetch(checkUrl, {
        headers: { ...STREAM_HEADERS, Referer: `${STREAM_ORIGIN}/` },
        signal: AbortSignal.timeout(5000),
      });
      if (!check.ok) return null;
      const preview = await check.text();
      if (!preview.includes("#EXTM3U")) return null;
      return {
        proxiedUrl: `/api/media/hls?id=${encodeURIComponent(streamMatch[1])}`,
        streamType: "hls",
      };
    } catch {
      return null;
    }
  }

  let absUrl: string;
  try {
    absUrl = new URL(rawUrl, STREAM_ORIGIN).toString();
  } catch {
    return null;
  }
  if (!/^https?:\/\//i.test(absUrl)) return null;

  const isMp4Hint = hintType?.toLowerCase() === "mp4" || /\.(mp4|mkv|webm)(\?|$)/i.test(absUrl);
  try {
    const check = await fetch(absUrl, {
      method: isMp4Hint ? "HEAD" : "GET",
      headers: {
        "User-Agent": STREAM_HEADERS["User-Agent"],
        Accept: "*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5500),
    });
    if (!check.ok) return null;

    if (!isMp4Hint) {
      const text = await check.text();
      if (!text.includes("#EXTM3U")) return null;
      return {
        proxiedUrl: signMediaProxyUrl(absUrl, `${STREAM_ORIGIN}/`),
        streamType: "hls",
      };
    }

    // Avoid .mkv when possible because Chromium cannot play some MKV audio codecs natively.
    if (/\.mkv(\?|$)/i.test(absUrl)) return null;
    return {
      proxiedUrl: signMediaProxyUrl(absUrl, `${STREAM_ORIGIN}/`),
      streamType: "mp4",
    };
  } catch {
    return null;
  }
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

      servers.sort(
        (a, b) => scoreServer(b.name, b.lang, data.lang) - scoreServer(a.name, a.lang, data.lang),
      );

      let resolved: { proxiedUrl: string; streamType: StreamType } | null = null;
      for (const srv of servers.slice(0, 8)) {
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
          if (!play.url) continue;
          const verified = await verifyPlayableStream(play.url, play.type);
          if (verified) {
            resolved = verified;
            break;
          }
        } catch {
          /* try next server */
        }
      }

      if (!resolved) {
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
              .sort((a, b) => isPreferredSub(b, data.lang) - isPreferredSub(a, data.lang))
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
        streamUrl: resolved.proxiedUrl,
        type: resolved.streamType,
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
