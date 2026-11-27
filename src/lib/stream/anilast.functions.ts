import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { signMediaProxyUrl } from "./media-proxy";
import {
  inferStreamType,
  type StreamSource,
  type StreamType,
  type SubtitleTrack,
} from "./resolver";

const ANILAST_ORIGIN = "https://anilast.xyz";

const ANILAST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: `${ANILAST_ORIGIN}/`,
  Origin: ANILAST_ORIGIN,
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

export interface AnimeEmbedFallback {
  label: string;
  url: string;
}

export function buildAnimeEmbedFallbacks(params: {
  anilistId: string;
  malId?: number | null | undefined;
  episode: number;
  audio: "sub" | "dub";
}): AnimeEmbedFallback[] {
  const out: AnimeEmbedFallback[] = [];
  const seen = new Set<string>();
  const push = (label: string, url: string) => {
    if (!seen.has(url)) {
      seen.add(url);
      out.push({ label, url });
    }
  };

  if (/^\d+$/.test(params.anilistId)) {
    push(
      "vidsrc.cc",
      `https://vidsrc.cc/v2/embed/anime/ani${params.anilistId}/${params.episode}/${params.audio}`,
    );
    push(
      "vidlink.pro",
      `https://vidlink.pro/anime/${params.anilistId}/${params.episode}/${params.audio}`,
    );
    push(
      "vidsrc.icu",
      `https://vidsrc.icu/embed/anime/${params.anilistId}/${params.episode}/${params.audio === "dub" ? 1 : 0}`,
    );
  }
  if (params.malId && params.malId > 0) {
    push(
      "vidsrc.cc (MAL)",
      `https://vidsrc.cc/v2/embed/anime/mal${params.malId}/${params.episode}/${params.audio}`,
    );
  }
  return out;
}

export interface AniLastStreamResult {
  ok: boolean;
  streamUrl: string | null;
  type: StreamType;
  provider: string;
  quality: string | null;
  subtitles: SubtitleTrack[];
  sources?: StreamSource[];
  embedUrl?: string | null;
  embedFallbacks?: AnimeEmbedFallback[];
  error?: string;
}

function rewriteAnimeProxyPath(raw: string, kind: "hls" | "subtitle"): string {
  const target = kind === "hls" ? "/api/anilast/hls" : "/api/anilast/subtitle";
  if (raw.startsWith(`/api/proxy/${kind}`)) {
    return raw.replace(`/api/proxy/${kind}`, target);
  }
  if (raw.startsWith(`${ANILAST_ORIGIN}/api/proxy/${kind}`)) {
    return raw.replace(`${ANILAST_ORIGIN}/api/proxy/${kind}`, target);
  }
  if (/^https?:\/\//i.test(raw)) {
    return signMediaProxyUrl(raw, `${ANILAST_ORIGIN}/`);
  }
  return raw;
}

function trackPriority(track: SubtitleTrack, prefLang: "en" | "fr"): number {
  const s = `${track.lang} ${track.label}`.toLowerCase();
  if (prefLang === "fr") {
    if (s.startsWith("fr") || s.includes("french") || s.includes("français")) return 3;
    if (s.startsWith("en") || s.includes("english")) return 2;
    return 0;
  }
  if (s.startsWith("en") || s.includes("english")) return 3;
  if (s.startsWith("fr") || s.includes("french")) return 1;
  return 0;
}

const StreamInputSchema = z.object({
  anilistId: z.string().regex(/^\d+$/),
  malId: z.number().int().positive().nullable().optional(),
  episode: z.number().int().min(1).max(5000),
  audio: z.enum(["sub", "dub"]).default("sub"),
  lang: z.enum(["en", "fr"]).default("en"),
  title: z.string().max(300).nullable().optional(),
  englishTitle: z.string().max(300).nullable().optional(),
  romajiTitle: z.string().max(300).nullable().optional(),
});

interface AniLastApiResponse {
  provider?: string;
  type?: string;
  url?: string;
  quality?: string;
  subtitles?: { url?: string; lang?: string; label?: string }[];
  error?: string;
}

async function queryAnimeEndpoint(
  lookupId: string | number,
  data: z.infer<typeof StreamInputSchema>,
): Promise<AniLastApiResponse | null> {
  const params = new URLSearchParams({
    anilistId: data.anilistId,
    lang: data.audio,
  });
  if (data.title) params.set("title", data.title);
  if (data.englishTitle) params.set("englishTitle", data.englishTitle);
  if (data.romajiTitle) params.set("romajiTitle", data.romajiTitle);

  const endpoint = `${ANILAST_ORIGIN}/api/anime/stream/${lookupId}/${data.episode}?${params.toString()}`;
  const res = await fetch(endpoint, {
    headers: ANILAST_HEADERS,
    signal: AbortSignal.timeout(5500),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as AniLastApiResponse;
  if (!json.url) return null;
  return json;
}

export const getAniLastAnimeStream = createServerFn({ method: "GET" })
  .inputValidator((input) => StreamInputSchema.parse(input))
  .handler(async ({ data }): Promise<AniLastStreamResult> => {
    const candidates: (string | number)[] = [];
    if (data.malId) candidates.push(data.malId);
    if (!data.malId || String(data.malId) !== data.anilistId) {
      candidates.push(data.anilistId);
    }

    const baseEmbeds = buildAnimeEmbedFallbacks({
      anilistId: data.anilistId,
      malId: data.malId,
      episode: data.episode,
      audio: data.audio,
    });

    try {
      const settled = await Promise.allSettled(
        candidates.map((lookupId) => queryAnimeEndpoint(lookupId, data)),
      );

      const directHits: AniLastApiResponse[] = [];
      let upstreamEmbedUrl: string | null = null;
      for (const r of settled) {
        if (r.status !== "fulfilled" || !r.value?.url) continue;
        if (r.value.type === "embed") {
          upstreamEmbedUrl ??= r.value.url;
        } else {
          directHits.push(r.value);
        }
      }

      const embedFallbacks = upstreamEmbedUrl
        ? [{ label: "Mirror Embed", url: upstreamEmbedUrl }, ...baseEmbeds]
        : baseEmbeds;
      const primaryEmbed = embedFallbacks[0]?.url ?? null;

      if (directHits.length === 0) {
        return {
          ok: false,
          streamUrl: null,
          type: "hls",
          provider: "SHADOW Stream",
          quality: null,
          subtitles: [],
          embedUrl: primaryEmbed,
          embedFallbacks,
          error:
            data.audio === "dub"
              ? "Dub audio is not available for this episode yet — try Sub or another episode."
              : "Direct video stream is temporarily unavailable for this episode.",
        };
      }

      const seenUrls = new Set<string>();
      const sources: StreamSource[] = [];
      for (const hit of directHits) {
        if (!hit.url) continue;
        const rewritten = rewriteAnimeProxyPath(hit.url, "hls");
        if (seenUrls.has(rewritten)) continue;
        seenUrls.add(rewritten);
        sources.push({
          url: rewritten,
          type: inferStreamType(rewritten, hit.type),
          label: `Server ${sources.length + 1} · ${data.audio.toUpperCase()}`,
          lang: data.audio,
        });
      }

      const primary = directHits[0]!;
      const primarySource = sources[0]!;

      const mergedSubs = directHits.flatMap((h) => h.subtitles ?? []);
      const seenSubUrls = new Set<string>();
      const subtitles: SubtitleTrack[] = [];
      for (const s of mergedSubs) {
        if (!s.url) continue;
        const url = rewriteAnimeProxyPath(s.url, "subtitle");
        if (seenSubUrls.has(url)) continue;
        seenSubUrls.add(url);
        subtitles.push({
          url,
          lang: s.lang ?? "en",
          label: s.label ?? "Subtitles",
        });
      }
      subtitles.sort((a, b) => trackPriority(b, data.lang) - trackPriority(a, data.lang));

      return {
        ok: true,
        streamUrl: primarySource.url,
        type: primarySource.type,
        provider: "SHADOW Stream",
        quality: primary.quality ?? null,
        subtitles,
        sources,
        embedUrl: primaryEmbed,
        embedFallbacks,
      };
    } catch (error) {
      console.error("Anime stream lookup failed", error);
      return {
        ok: false,
        streamUrl: null,
        type: "hls",
        provider: "SHADOW Stream",
        quality: null,
        subtitles: [],
        embedUrl: baseEmbeds[0]?.url ?? null,
        embedFallbacks: baseEmbeds,
        error: "Stream server temporarily unavailable.",
      };
    }
  });
