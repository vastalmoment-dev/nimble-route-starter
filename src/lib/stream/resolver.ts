import type { Source } from "@/lib/catalog/types";
import { siteLanguage, type SiteLanguage } from "@/lib/i18n/language";

export type StreamType = "hls" | "mp4";
export type AudioOption = "sub" | "dub";

export interface SubtitleTrack {
  url: string;
  lang: string;
  label: string;
}

export interface StreamSource {
  url: string;
  type: StreamType;
  label: string;
  lang?: string | null | undefined;
}

export interface ResolvedStream {
  url: string;
  type: StreamType;
  /** Human label, e.g. which resolver answered. */
  provider: string;
  /** True when the stream is a placeholder sample, not the licensed title. */
  isDemo: boolean;
  subtitles?: SubtitleTrack[];
  sources?: StreamSource[];
}

export interface StreamRequest {
  source: Source;
  id: string;
  episode: number;
  season?: number | undefined;
  mediaType?: "tv" | "movie" | undefined;
  title: string;
  year?: number | null | undefined;
  audio?: AudioOption | undefined;
  lang?: SiteLanguage | undefined;
  includeSubtitles?: boolean | undefined;
  malId?: number | null | undefined;
  anilistId?: string | null | undefined;
  isAnime?: boolean | undefined;
  imdbId?: string | null | undefined;
  tmdbId?: string | null | undefined;
  englishTitle?: string | null | undefined;
  romajiTitle?: string | null | undefined;
}

/** Any backend that can answer `{ url, type }` for a title plugs in here. */
export interface StreamResolver {
  name: string;
  resolve(req: StreamRequest): Promise<ResolvedStream | null>;
}

export function inferStreamType(url: string, hint?: string | null): StreamType {
  const h = hint?.toLowerCase();
  if (h === "hls" || h === "m3u8" || h === "application/x-mpegurl") return "hls";
  if (h === "mp4" || h === "video/mp4") return "mp4";
  return /\.m3u8(\?|#|$)/i.test(url) ? "hls" : "mp4";
}

/**
 * Endpoint resolver: set VITE_STREAM_RESOLVER_URL to an endpoint that returns JSON
 * `{ "url": "...", "type": "hls" | "mp4" }` for `?source=&id=&episode=`.
 */
export function endpointResolver(base: string): StreamResolver {
  return {
    name: "endpoint",
    async resolve(req) {
      const u = new URL(base);
      u.searchParams.set("source", req.source);
      u.searchParams.set("id", req.id);
      u.searchParams.set("episode", String(req.episode));
      if (req.season) u.searchParams.set("season", String(req.season));
      if (req.audio) u.searchParams.set("audio", req.audio);
      const res = await fetch(u.toString(), { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const body = (await res.json()) as { url?: string; type?: string };
      if (!body.url) return null;
      return {
        url: body.url,
        type: inferStreamType(body.url, body.type),
        provider: "SHADOW Stream",
        isDemo: false,
      };
    },
  };
}

export async function resolveContinuousAnimeEpisode(
  req: Pick<StreamRequest, "source" | "id" | "season" | "episode" | "mediaType">,
): Promise<number> {
  if (req.source !== "anilist" && (req.season ?? 1) > 1 && req.mediaType !== "movie") {
    try {
      const { loadDetail } = await import("@/lib/catalog");
      const srcDetail = await loadDetail(req.source, req.id);
      const earlierCount = (srcDetail.episodes ?? []).filter(
        (e) => (e.season ?? 1) < req.season!,
      ).length;
      if (earlierCount > 0) return earlierCount + req.episode;
    } catch {
      /* use raw episode if detail lookup fails */
    }
  }
  return req.episode;
}

/** Internal anime stream resolver (supports sub and dub). */
export const aniLastResolver: StreamResolver = {
  name: "anime-stream",
  async resolve(req) {
    let targetAnilistId = req.anilistId ?? (req.source === "anilist" ? req.id : null);
    if (!targetAnilistId && req.isAnime) {
      const { resolveAniListIdForItem } = await import("@/lib/catalog/anime-bridge");
      targetAnilistId = await resolveAniListIdForItem({
        source: req.source,
        id: req.id,
        title: req.title,
        englishTitle: req.englishTitle,
        imdbId: req.imdbId,
      });
    }
    if (!targetAnilistId || !/^\d+$/.test(targetAnilistId)) return null;

    const continuousEpisode = await resolveContinuousAnimeEpisode(req);
    const { resolveAnimeSeasonTarget } = await import("@/lib/catalog/anime-bridge");
    const target = await resolveAnimeSeasonTarget({
      source: req.source,
      canonicalAnilistId: targetAnilistId,
      season: req.season,
      episode: req.episode,
      mediaType: req.mediaType,
      malId: req.malId,
      title: req.title,
      englishTitle: req.englishTitle,
      romajiTitle: req.romajiTitle,
      continuousEpisode,
    });

    targetAnilistId = target.anilistId;
    let malId = target.malId ?? null;
    let resolvedTitle = target.title ?? req.title;
    let englishTitle = target.englishTitle ?? req.englishTitle ?? null;
    let romajiTitle = target.romajiTitle ?? req.romajiTitle ?? null;

    if (!malId) {
      try {
        const { fetchAnimeDetail } = await import("@/lib/catalog/anilist");
        const detail = await fetchAnimeDetail(targetAnilistId);
        malId = detail.malId ?? null;
        resolvedTitle = detail.title || resolvedTitle;
        englishTitle = englishTitle ?? detail.englishTitle ?? null;
        romajiTitle = romajiTitle ?? detail.romajiTitle ?? null;
      } catch {
        /* continue with AniList id */
      }
    }

    const { getAniLastAnimeStream } = await import("@/lib/stream/anilast.functions");
    const result = await getAniLastAnimeStream({
      data: {
        anilistId: targetAnilistId,
        malId,
        episode: target.episode,
        audio: req.audio ?? "sub",
        lang: req.lang ?? siteLanguage.get(),
        isMovie: req.mediaType === "movie",
        title: resolvedTitle,
        englishTitle,
        romajiTitle,
      },
    });
    if (!result.ok || !result.streamUrl) return null;
    return {
      url: result.streamUrl,
      type: result.type,
      provider: "SHADOW Stream",
      isDemo: false,
      subtitles: result.subtitles,
      ...(result.sources?.length ? { sources: result.sources } : {}),
    };
  },
};

function extractImdbAndTmdb(req: StreamRequest): {
  imdbId: string | null;
  tmdbId: string | null;
  mediaType: "movie" | "tv";
} {
  let imdbId = req.imdbId ?? null;
  let tmdbId = req.tmdbId ?? null;
  let mediaType: "movie" | "tv" = req.mediaType ?? "movie";

  if (req.source === "cinemeta") {
    const m = /^(movie|series)-(tt\d{5,10})$/.exec(req.id);
    if (m) {
      mediaType = m[1] === "movie" ? "movie" : "tv";
      imdbId = m[2]!;
    } else if (/^tt\d{5,10}$/.test(req.id)) {
      imdbId = req.id;
    }
  } else if (req.source === "tmdb") {
    const m = /^(movie|tv)-(\d+)$/.exec(req.id);
    if (m) {
      mediaType = m[1] === "movie" ? "movie" : "tv";
      tmdbId = m[2]!;
    }
  } else if (req.source === "tvmaze") {
    mediaType = "tv";
  }

  return { imdbId, tmdbId, mediaType };
}

/** Stream resolver for cartoons, movies, and series. */
export const mediaStreamResolver: StreamResolver = {
  name: "media-stream",
  async resolve(req) {
    if (req.source === "anilist") return null;
    const extracted = extractImdbAndTmdb(req);
    let imdbId = extracted.imdbId;
    const { tmdbId, mediaType } = extracted;

    if (!imdbId && !tmdbId && req.source === "tvmaze") {
      try {
        const { fetchShowDetail } = await import("@/lib/catalog/tvmaze");
        const detail = await fetchShowDetail(req.id);
        imdbId = detail.imdbId ?? null;
      } catch {
        /* ignore */
      }
    }

    if (!imdbId && !tmdbId && !req.title) return null;

    const { getMediaStream } = await import("./media.functions");
    const result = await getMediaStream({
      data: {
        mediaType,
        imdbId,
        tmdbId,
        title: req.title || null,
        year: req.year ?? null,
        season: req.season ?? 1,
        episode: req.episode,
        lang: req.lang ?? siteLanguage.get(),
      },
    });
    if (!result.ok || !result.streamUrl) return null;
    return {
      url: result.streamUrl,
      type: result.type,
      provider: "SHADOW Stream",
      isDemo: false,
      subtitles: result.subtitles,
      ...(result.sources?.length ? { sources: result.sources } : {}),
    };
  },
};

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const RESOLVER_BASE = (() => {
  try {
    return (import.meta.env as Record<string, string | undefined> | undefined)?.[
      "VITE_STREAM_RESOLVER_URL"
    ];
  } catch {
    return undefined;
  }
})();

/** True only when a real stream source is configured. */
export const hasStreamSource = Boolean(RESOLVER_BASE);

/** True when the given item source can resolve a downloadable/playable stream. */
export function canStreamSource(source?: Source): boolean {
  return (
    source === "anilist" ||
    source === "cinemeta" ||
    source === "tmdb" ||
    source === "tvmaze" ||
    hasStreamSource
  );
}

function configuredResolvers(req: StreamRequest): StreamResolver[] {
  const list: StreamResolver[] = [];
  if (req.source === "anilist" || req.isAnime || req.anilistId) {
    list.push(aniLastResolver);
  }
  if (req.source !== "anilist") {
    list.push(mediaStreamResolver);
  }
  if (RESOLVER_BASE) list.push(endpointResolver(RESOLVER_BASE));
  return list;
}

/** Tries each resolver in order; the first `{url, type}` wins. */
export async function resolveStream(
  req: StreamRequest,
  resolvers = configuredResolvers(req),
): Promise<ResolvedStream> {
  for (const r of resolvers) {
    try {
      const out = await r.resolve(req);
      if (out) return out;
    } catch (error) {
      console.warn(`Stream resolver "${r.name}" failed`, error);
    }
  }
  throw new Error("No downloadable stream is available for this title yet.");
}
