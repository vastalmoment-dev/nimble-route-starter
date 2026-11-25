import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { inferStreamType, type StreamType, type SubtitleTrack } from "./resolver";

const ANILAST_ORIGIN = "https://anilast.xyz";

const ANILAST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: `${ANILAST_ORIGIN}/`,
  Origin: ANILAST_ORIGIN,
  Accept: "application/json",
};

export interface AniLastStreamResult {
  ok: boolean;
  streamUrl: string | null;
  type: StreamType;
  provider: string;
  quality: string | null;
  subtitles: SubtitleTrack[];
  embedUrl: string;
  error?: string;
}

export function buildAniLastEmbedUrl({
  anilistId,
  episode,
  audio,
  title,
  malId,
}: {
  anilistId: string;
  episode: number;
  audio: "sub" | "dub";
  title?: string | null | undefined;
  malId?: number | null | undefined;
}): string {
  const params = new URLSearchParams({
    anilistId,
    lang: audio,
  });
  if (title) params.set("title", title);
  return `${ANILAST_ORIGIN}/watch/${malId || anilistId}/${episode}?${params.toString()}`;
}

function rewriteAniLastProxyPath(raw: string, kind: "hls" | "subtitle"): string {
  const target = kind === "hls" ? "/api/anilast/hls" : "/api/anilast/subtitle";
  if (raw.startsWith(`/api/proxy/${kind}`)) {
    return raw.replace(`/api/proxy/${kind}`, target);
  }
  if (raw.startsWith(`${ANILAST_ORIGIN}/api/proxy/${kind}`)) {
    return raw.replace(`${ANILAST_ORIGIN}/api/proxy/${kind}`, target);
  }
  return raw;
}

function isEnglishTrack(track: SubtitleTrack): boolean {
  return track.lang.toLowerCase().startsWith("en") || /english/i.test(track.label);
}

const StreamInputSchema = z.object({
  anilistId: z.string().regex(/^\d+$/),
  malId: z.number().int().positive().nullable().optional(),
  episode: z.number().int().min(1).max(5000),
  audio: z.enum(["sub", "dub"]).default("sub"),
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

export const getAniLastAnimeStream = createServerFn({ method: "GET" })
  .inputValidator((input) => StreamInputSchema.parse(input))
  .handler(async ({ data }): Promise<AniLastStreamResult> => {
    const embedUrl = buildAniLastEmbedUrl({
      anilistId: data.anilistId,
      episode: data.episode,
      audio: data.audio,
      title: data.title,
      malId: data.malId,
    });

    const params = new URLSearchParams({
      anilistId: data.anilistId,
      lang: data.audio,
    });
    if (data.title) params.set("title", data.title);
    if (data.englishTitle) params.set("englishTitle", data.englishTitle);
    if (data.romajiTitle) params.set("romajiTitle", data.romajiTitle);

    const lookupId = data.malId || data.anilistId;
    const endpoint = `${ANILAST_ORIGIN}/api/anime/stream/${lookupId}/${data.episode}?${params.toString()}`;

    try {
      const res = await fetch(endpoint, { headers: ANILAST_HEADERS });
      if (!res.ok) {
        return {
          ok: false,
          streamUrl: null,
          type: "hls",
          provider: "AniLast",
          quality: null,
          subtitles: [],
          embedUrl,
          error: `AniLast stream returned ${res.status}`,
        };
      }
      const json = (await res.json()) as AniLastApiResponse;
      if (!json.url || json.type === "embed") {
        return {
          ok: false,
          streamUrl: null,
          type: "hls",
          provider: json.provider ?? "AniLast",
          quality: null,
          subtitles: [],
          embedUrl,
          error: json.error ?? "Direct stream unavailable; use embedded player.",
        };
      }

      const streamUrl = rewriteAniLastProxyPath(json.url, "hls");
      const subtitles: SubtitleTrack[] = (json.subtitles ?? [])
        .filter((s): s is { url: string; lang?: string; label?: string } => Boolean(s.url))
        .map((s) => ({
          url: rewriteAniLastProxyPath(s.url, "subtitle"),
          lang: s.lang ?? "en",
          label: s.label ?? "Subtitles",
        }))
        .sort((a, b) => Number(isEnglishTrack(b)) - Number(isEnglishTrack(a)));

      return {
        ok: true,
        streamUrl,
        type: inferStreamType(streamUrl, json.type),
        provider: json.provider ? `AniLast (${json.provider})` : "AniLast",
        quality: json.quality ?? null,
        subtitles,
        embedUrl,
      };
    } catch (error) {
      console.error("AniLast stream lookup failed", error);
      return {
        ok: false,
        streamUrl: null,
        type: "hls",
        provider: "AniLast",
        quality: null,
        subtitles: [],
        embedUrl,
        error: "Could not reach AniLast right now.",
      };
    }
  });
