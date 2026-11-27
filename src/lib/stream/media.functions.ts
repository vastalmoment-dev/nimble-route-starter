import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { signMediaProxyUrl } from "./media-proxy";
import type { StreamSource, StreamType, SubtitleTrack } from "./resolver";

const STREAM_ORIGIN = "https://vidsrc.buzz";
const VIDSRC_CC_ORIGIN = "https://vidsrc.cc";
const VIDSRC_XYZ_ORIGIN = "https://vidsrc.xyz";
const EMBED_SU_ORIGIN = "https://embed.su";
const FALLBACK_EMBED_ORIGIN = "https://vidlink.pro";
const BACKUP_EMBED_ORIGIN = "https://www.2embed.cc";

const STREAM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: `${STREAM_ORIGIN}/`,
  Origin: STREAM_ORIGIN,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
};

export interface EmbedFallback {
  label: string;
  url: string;
}

export interface MediaStreamResult {
  ok: boolean;
  streamUrl: string | null;
  type: StreamType;
  provider: string;
  subtitles: SubtitleTrack[];
  embedUrl: string | null;
  sources?: StreamSource[];
  embedFallbacks?: EmbedFallback[];
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
  title: z.string().max(300).nullable().optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
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

export function buildMediaEmbedFallbacks(params: {
  mediaType: "movie" | "tv";
  imdbId?: string | null | undefined;
  tmdbId?: string | null | undefined;
  season: number;
  episode: number;
}): EmbedFallback[] {
  const out: EmbedFallback[] = [];
  const seen = new Set<string>();
  const push = (label: string, url: string) => {
    if (!seen.has(url)) {
      seen.add(url);
      out.push({ label, url });
    }
  };

  const primaryId = params.tmdbId || params.imdbId;
  if (primaryId) {
    push(
      "vidsrc.cc",
      params.mediaType === "movie"
        ? `${VIDSRC_CC_ORIGIN}/v2/embed/movie/${primaryId}`
        : `${VIDSRC_CC_ORIGIN}/v2/embed/tv/${primaryId}/${params.season}/${params.episode}`,
    );
    push(
      "vidsrc.xyz",
      params.mediaType === "movie"
        ? `${VIDSRC_XYZ_ORIGIN}/embed/movie/${primaryId}`
        : `${VIDSRC_XYZ_ORIGIN}/embed/tv/${primaryId}/${params.season}/${params.episode}`,
    );
    push(
      "embed.su",
      params.mediaType === "movie"
        ? `${EMBED_SU_ORIGIN}/embed/movie/${primaryId}`
        : `${EMBED_SU_ORIGIN}/embed/tv/${primaryId}/${params.season}/${params.episode}`,
    );
  }
  if (params.tmdbId) {
    push(
      "vidlink.pro",
      params.mediaType === "movie"
        ? `${FALLBACK_EMBED_ORIGIN}/movie/${params.tmdbId}`
        : `${FALLBACK_EMBED_ORIGIN}/tv/${params.tmdbId}/${params.season}/${params.episode}`,
    );
  }
  if (params.imdbId) {
    push(
      "2embed",
      params.mediaType === "movie"
        ? `${BACKUP_EMBED_ORIGIN}/embed/${params.imdbId}`
        : `${BACKUP_EMBED_ORIGIN}/embedtv/${params.imdbId}&s=${params.season}&e=${params.episode}`,
    );
  }
  return out;
}

async function resolveImdbByTitle(
  title: string,
  mediaType: "movie" | "tv",
  year?: number | null,
): Promise<string | null> {
  const cleanTitle = title.trim();
  if (cleanTitle.length < 2) return null;

  try {
    const cmType = mediaType === "movie" ? "movie" : "series";
    const cmRes = await fetch(
      `https://v3-cinemeta.strem.io/catalog/${cmType}/top/search=${encodeURIComponent(cleanTitle)}.json`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000) },
    );
    if (cmRes.ok) {
      const json = (await cmRes.json()) as {
        metas?: { id?: string; name?: string; releaseInfo?: string; year?: string | number }[];
      };
      const metas = (json.metas ?? []).filter((m) => m.id && /^tt\d{5,10}$/.test(m.id));
      if (metas.length > 0) {
        if (year) {
          const yearMatch = metas.find((m) =>
            String(m.releaseInfo ?? m.year ?? "").includes(String(year)),
          );
          if (yearMatch?.id) return yearMatch.id;
        }
        return metas[0]!.id!;
      }
    }
  } catch {
    /* fall through to IMDb suggestions */
  }

  try {
    const clean = cleanTitle.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
    const firstChar = /^[a-z0-9]/.test(clean) ? clean[0]! : "x";
    const res = await fetch(
      `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(cleanTitle)}.json`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      d?: { id?: string; qid?: string; y?: number }[];
    };
    const allowed =
      mediaType === "movie" ? new Set(["movie"]) : new Set(["tvSeries", "tvMiniSeries"]);
    const candidates = (json.d ?? []).filter(
      (entry) =>
        entry.id && /^tt\d{5,10}$/.test(entry.id) && (!entry.qid || allowed.has(entry.qid)),
    );
    if (year) {
      const exact = candidates.find((c) => c.y === year);
      if (exact?.id) return exact.id;
    }
    return candidates[0]?.id ?? null;
  } catch {
    return null;
  }
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

function formatServerLabel(
  index: number,
  rawLang: string | null | undefined,
  rawName: string | undefined,
): string {
  const cleaned = (rawLang || "").replace(/[-_]/g, " ").trim();
  const extractedLang =
    cleaned ||
    (rawName && /-(hindi|english|french|telugu|tamil|korean|spanish)/i.exec(rawName)?.[1]) ||
    "";
  const langTag = extractedLang
    ? extractedLang.charAt(0).toUpperCase() + extractedLang.slice(1).toLowerCase()
    : "";
  return langTag ? `Server ${index + 1} · ${langTag}` : `Server ${index + 1}`;
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
        headers: {
          "User-Agent": STREAM_HEADERS["User-Agent"],
          Referer: `${STREAM_ORIGIN}/`,
          Origin: STREAM_ORIGIN,
          Accept: "application/vnd.apple.mpegurl,application/x-mpegurl,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(4000),
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
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
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

async function resolveFromLookupId(
  lookupId: string,
  data: z.infer<typeof MediaStreamInputSchema>,
): Promise<{
  sources: StreamSource[];
  subtitles: SubtitleTrack[];
} | null> {
  const pageUrl =
    data.mediaType === "movie"
      ? `${STREAM_ORIGIN}/embed/movie/${lookupId}`
      : `${STREAM_ORIGIN}/embed/tv/${lookupId}/${data.season}/${data.episode}`;

  const htmlRes = await fetch(pageUrl, {
    headers: STREAM_HEADERS,
    signal: AbortSignal.timeout(4500),
  });
  if (!htmlRes.ok) return null;

  const html = await htmlRes.text();
  const qMatch = /var Q = (\{.*?\});\s*var \$=/s.exec(html);
  if (!qMatch) return null;

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
      headers: { ...STREAM_HEADERS, Referer: pageUrl, Accept: "application/json,*/*;q=0.8" },
      signal: AbortSignal.timeout(4000),
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

  const candidates = servers.slice(0, 4);
  const settled = await Promise.allSettled(
    candidates.map(async (srv) => {
      const playRes = await fetch(
        `${STREAM_ORIGIN}/pl/api.php?a=play&ref=${encodeURIComponent(srv.ref)}`,
        {
          headers: { ...STREAM_HEADERS, Referer: pageUrl, Accept: "application/json,*/*;q=0.8" },
          signal: AbortSignal.timeout(4000),
        },
      );
      if (!playRes.ok) return null;
      const play = (await playRes.json()) as { url?: string; type?: string };
      if (!play.url) return null;
      const verified = await verifyPlayableStream(play.url, play.type);
      if (!verified) return null;
      return {
        url: verified.proxiedUrl,
        type: verified.streamType,
        lang: srv.lang ?? null,
        name: srv.name,
      };
    }),
  );

  const seenUrls = new Set<string>();
  const sources: StreamSource[] = [];
  for (const res of settled) {
    if (res.status !== "fulfilled" || !res.value) continue;
    if (seenUrls.has(res.value.url)) continue;
    seenUrls.add(res.value.url);
    sources.push({
      url: res.value.url,
      type: res.value.type,
      label: formatServerLabel(sources.length, res.value.lang, res.value.name),
      lang: res.value.lang,
    });
  }

  if (!sources.length) return null;

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

  return { sources, subtitles };
}

export const getMediaStream = createServerFn({ method: "GET" })
  .inputValidator((input) => MediaStreamInputSchema.parse(input))
  .handler(async ({ data }): Promise<MediaStreamResult> => {
    let resolvedImdb = data.imdbId ?? null;
    if (!resolvedImdb && !data.tmdbId && data.title) {
      resolvedImdb = await resolveImdbByTitle(data.title, data.mediaType, data.year);
    }

    const embedFallbacks = buildMediaEmbedFallbacks({
      mediaType: data.mediaType,
      imdbId: resolvedImdb,
      tmdbId: data.tmdbId,
      season: data.season,
      episode: data.episode,
    });
    const embedUrl = embedFallbacks[0]?.url ?? null;

    const lookupIds = [resolvedImdb, data.tmdbId].filter((x): x is string => Boolean(x));
    if (!lookupIds.length) {
      return {
        ok: false,
        streamUrl: null,
        type: "hls",
        provider: "SHADOW Stream",
        subtitles: [],
        embedUrl,
        embedFallbacks,
        error: "Playback identifier is unavailable for this title.",
      };
    }

    try {
      for (const lookupId of lookupIds) {
        try {
          const hit = await resolveFromLookupId(lookupId, data);
          if (hit && hit.sources.length > 0) {
            return {
              ok: true,
              streamUrl: hit.sources[0]!.url,
              type: hit.sources[0]!.type,
              provider: "SHADOW Stream",
              subtitles: hit.subtitles,
              embedUrl,
              sources: hit.sources,
              embedFallbacks,
            };
          }
        } catch {
          /* try secondary ID */
        }
      }

      return {
        ok: false,
        streamUrl: null,
        type: "hls",
        provider: "SHADOW Stream",
        subtitles: [],
        embedUrl,
        embedFallbacks,
        error: "Using alternate player for this title.",
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
        embedFallbacks,
        error: "Stream temporarily unavailable.",
      };
    }
  });
