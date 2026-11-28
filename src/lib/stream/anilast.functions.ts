import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  detectAnimeSeasonFromTitles,
  extractDirectStreamsFromEmbeds,
  fetchAnimeExternalIds,
  fetchEnglishOpenSubtitles,
  fetchFrenchOpenSubtitles,
  resolveFrenchAnimeSources,
} from "./anime-fr";
import { filterAvailableEmbeds, probeSingleEmbed } from "./embed-probe";
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
  available?: boolean;
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

  if (params.audio === "dub") {
    // Dedicated /dub endpoints first so DUB never silently defaults to Japanese Sub audio.
    if (params.malId && params.malId > 0) {
      push(
        "megaplay.buzz",
        `https://megaplay.buzz/stream/mal/${params.malId}/${params.episode}/dub`,
      );
    }
    if (/^\d+$/.test(params.anilistId)) {
      push("vidsrc.su", `https://vidsrc.su/embed/anime/${params.anilistId}/${params.episode}/dub`);
      push("vidlink.pro", `https://vidlink.pro/anime/${params.anilistId}/${params.episode}/dub`);
      push("vidnest.fun", `https://vidnest.fun/anime/${params.anilistId}/${params.episode}/dub`);
      push(
        "vidcore.io",
        `https://vidcore.io/embed/anime/${params.anilistId}/${params.episode}?dub=true`,
      );
    }
    return out;
  }

  if (/^\d+$/.test(params.anilistId)) {
    push("vidcore.io", `https://vidcore.io/embed/anime/${params.anilistId}/${params.episode}`);
  }
  if (params.malId && params.malId > 0) {
    push(
      "megaplay.buzz",
      `https://megaplay.buzz/stream/mal/${params.malId}/${params.episode}/${params.audio}`,
    );
  }
  if (/^\d+$/.test(params.anilistId)) {
    push(
      "vidsrc.su",
      `https://vidsrc.su/embed/anime/${params.anilistId}/${params.episode}/${params.audio}`,
    );
    push(
      "vidnest.fun",
      `https://vidnest.fun/anime/${params.anilistId}/${params.episode}/${params.audio}`,
    );
    push(
      "vidlink.pro",
      `https://vidlink.pro/anime/${params.anilistId}/${params.episode}/${params.audio}`,
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
  hasFrenchSubtitles?: boolean;
  isFrenchAudio?: boolean;
  dubFallbackToEnglish?: boolean;
  error?: string;
}

function rewriteAnimeProxyPath(raw: string, kind: "hls" | "subtitle" | "stream"): string {
  const effectiveKind =
    kind === "subtitle" ? "subtitle" : raw.includes("/api/proxy/stream") ? "stream" : "hls";
  const target =
    effectiveKind === "subtitle"
      ? "/api/anilast/subtitle"
      : effectiveKind === "stream"
        ? "/api/anilast/stream"
        : "/api/anilast/hls";

  if (raw.startsWith(`/api/proxy/${effectiveKind}`)) {
    return raw.replace(`/api/proxy/${effectiveKind}`, target);
  }
  if (raw.startsWith(`${ANILAST_ORIGIN}/api/proxy/${effectiveKind}`)) {
    return raw.replace(`${ANILAST_ORIGIN}/api/proxy/${effectiveKind}`, target);
  }
  if (/^https?:\/\//i.test(raw)) {
    return signMediaProxyUrl(raw, `${ANILAST_ORIGIN}/`);
  }
  return raw;
}

function isFrenchTrack(track: SubtitleTrack): boolean {
  const s = `${track.lang} ${track.label}`.toLowerCase();
  return /^(fr|fre|fra)\b/i.test(track.lang.trim()) || /\b(french|fran[cç]ais|vostfr)\b/i.test(s);
}

function trackPriority(track: SubtitleTrack, prefLang: "en" | "fr"): number {
  const s = `${track.lang} ${track.label}`.toLowerCase();
  if (prefLang === "fr") {
    if (isFrenchTrack(track)) return 3;
    if (s.startsWith("en") || s.includes("english")) return 2;
    return 0;
  }
  if (s.startsWith("en") || s.includes("english")) return 3;
  if (isFrenchTrack(track)) return 1;
  return 0;
}

const StreamInputSchema = z.object({
  anilistId: z.string().regex(/^\d+$/),
  malId: z.number().int().positive().nullable().optional(),
  episode: z.number().int().min(1).max(5000),
  audio: z.enum(["sub", "dub"]).default("sub"),
  lang: z.enum(["en", "fr"]).default("en"),
  isMovie: z.boolean().optional(),
  title: z.string().max(300).nullable().optional(),
  englishTitle: z.string().max(300).nullable().optional(),
  romajiTitle: z.string().max(300).nullable().optional(),
});

interface AniLastApiResponse {
  provider?: string;
  type?: string;
  url?: string;
  quality?: string;
  audio?: string;
  subtitles?: { url?: string; lang?: string; label?: string }[];
  error?: string;
}

function decodeSafe(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function looksSubOnlyResponse(hit: AniLastApiResponse): boolean {
  const hay = decodeSafe(`${hit.audio ?? ""} ${hit.provider ?? ""} ${hit.url ?? ""}`).toLowerCase();
  const hasSubTag = /(?:^|[/?&=_.-])sub(?:bed)?(?:$|[/?&=_.-])|\bjapanese\b|\braw\b/.test(hay);
  const hasDubTag = /(?:^|[/?&=_.-])(?:dub|dubbed|dual|english)(?:$|[/?&=_.-])/.test(hay);
  return hasSubTag && !hasDubTag;
}

function looksExplicitDubResponse(hit: AniLastApiResponse): boolean {
  const hay = decodeSafe(`${hit.audio ?? ""} ${hit.provider ?? ""} ${hit.url ?? ""}`).toLowerCase();
  return /(?:^|[/?&=_.-])(?:dub|dubbed|dual|english)(?:$|[/?&=_.-])/.test(hay);
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

function dedupeEmbeds(list: AnimeEmbedFallback[]): AnimeEmbedFallback[] {
  const seen = new Set<string>();
  const out: AnimeEmbedFallback[] = [];
  for (const item of list) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

export async function resolveAnimeStream(
  rawInput: z.input<typeof StreamInputSchema>,
): Promise<AniLastStreamResult> {
  const data = StreamInputSchema.parse(rawInput);
  const candidates: (string | number)[] = [];
  if (data.malId) candidates.push(data.malId);
  if (!data.malId || String(data.malId) !== data.anilistId) {
    candidates.push(data.anilistId);
  }

  let effectiveMalId: number | null = data.malId ?? null;
  let baseEmbeds = buildAnimeEmbedFallbacks({
    anilistId: data.anilistId,
    malId: effectiveMalId,
    episode: data.episode,
    audio: data.audio,
  });

  const isEnglishTrack = (track: SubtitleTrack) => {
    const s = `${track.lang} ${track.label}`.toLowerCase();
    return /^(en|eng)\b/i.test(track.lang.trim()) || /\b(english|anglais)\b/i.test(s);
  };

  let dubFallbackToEnglish = false;

  // French mode + DUB (VF): try genuine French VF sources first (anime-sama + vostfree);
  // extract direct HLS/MP4 when available so downloads & native player work, otherwise fall back to English Dub + FR subtitles.
  if (data.lang === "fr" && data.audio === "dub") {
    try {
      const ext = await fetchAnimeExternalIds(data.anilistId);
      if (!effectiveMalId && ext.malId) effectiveMalId = ext.malId;
      const titles = [data.title, data.englishTitle, data.romajiTitle, ext.frTitle];
      const vfEmbeds = await resolveFrenchAnimeSources({
        titles,
        episode: data.episode,
        variant: "vf",
        isMovie: Boolean(data.isMovie || ext.isMovie),
      });

      if (vfEmbeds.length > 0) {
        const directVfSources = await extractDirectStreamsFromEmbeds(vfEmbeds, {
          langLabel: "VF",
          streamLang: "fr",
        });
        return {
          ok: directVfSources.length > 0,
          streamUrl: directVfSources[0]?.url ?? null,
          type: directVfSources[0]?.type ?? "hls",
          provider: "SHADOW Stream",
          quality: null,
          subtitles: [],
          ...(directVfSources.length > 0 ? { sources: directVfSources } : {}),
          embedUrl: vfEmbeds[0]!.url,
          embedFallbacks: vfEmbeds,
          hasFrenchSubtitles: false,
          isFrenchAudio: true,
          dubFallbackToEnglish: false,
        };
      }

      // VF unavailable: continue cleanly with English Dub audio + French subtitles!
      dubFallbackToEnglish = true;
    } catch (error) {
      console.error("French anime VF lookup failed — falling back to EN dub + FR subs", error);
      dubFallbackToEnglish = true;
    }
  }

  try {
    const titles = [data.title, data.englishTitle, data.romajiTitle];
    const extPromise = fetchAnimeExternalIds(data.anilistId);
    const vostfrPromise =
      data.lang === "fr" && data.audio === "sub"
        ? extPromise.then((ext) =>
            resolveFrenchAnimeSources({
              titles: [...titles, ext?.frTitle],
              episode: data.episode,
              variant: "vostfr",
              isMovie: Boolean(data.isMovie || ext?.isMovie),
            }),
          )
        : Promise.resolve([]);

    const [settledInitial, ext, vostfrEmbeds] = await Promise.all([
      Promise.allSettled(candidates.map((lookupId) => queryAnimeEndpoint(lookupId, data))),
      extPromise,
      vostfrPromise,
    ]);

    const settled = [...settledInitial];
    if (!effectiveMalId && ext?.malId) {
      effectiveMalId = ext.malId;
      if (!candidates.includes(effectiveMalId)) {
        const extraHit = await Promise.allSettled([queryAnimeEndpoint(effectiveMalId, data)]);
        settled.push(...extraHit);
      }
      baseEmbeds = buildAnimeEmbedFallbacks({
        anilistId: data.anilistId,
        malId: effectiveMalId,
        episode: data.episode,
        audio: data.audio,
      });
    }

    const probedBaseEmbeds = await filterAvailableEmbeds(baseEmbeds);

    const directHits: AniLastApiResponse[] = [];
    let upstreamEmbedUrl: string | null = null;
    for (const r of settled) {
      if (r.status !== "fulfilled" || !r.value?.url) continue;
      if (r.value.type === "embed") {
        // Never allow a sub-only upstream embed when the viewer explicitly chose DUB.
        if (data.audio === "dub" && looksSubOnlyResponse(r.value)) continue;
        upstreamEmbedUrl ??= r.value.url;
      } else {
        // When DUB is requested, reject hits explicitly tagged as Sub-only so we fall through to real Dub embeds.
        if (data.audio === "dub" && looksSubOnlyResponse(r.value)) continue;
        directHits.push(r.value);
      }
    }

    // Detect silent dub-to-sub fallback (e.g. anilast returning the exact Japanese sub URL for lang=dub).
    if (
      data.audio === "dub" &&
      directHits.length > 0 &&
      directHits.every(
        (hit) =>
          !looksExplicitDubResponse(hit) &&
          hit.type !== "mp4" &&
          !hit.url?.includes("/api/proxy/stream"),
      )
    ) {
      const subCompare = await queryAnimeEndpoint(candidates[0]!, { ...data, audio: "sub" }).catch(
        () => null,
      );
      if (subCompare?.url && directHits.every((hit) => hit.url === subCompare.url)) {
        directHits.length = 0;
      }
    }

    if (data.audio === "dub" && directHits.length > 1) {
      directHits.sort(
        (a, b) => Number(looksExplicitDubResponse(b)) - Number(looksExplicitDubResponse(a)),
      );
    }

    const isSandboxBlockedHost =
      Boolean(upstreamEmbedUrl) &&
      /(^|\.)(2embed\.cc|vidsrc\.me|vidsrc\.buzz)\b/i.test(upstreamEmbedUrl!);
    const mirrorOk =
      upstreamEmbedUrl && !isSandboxBlockedHost
        ? await probeSingleEmbed(upstreamEmbedUrl, 2400)
        : false;
    const mirrorList: AnimeEmbedFallback[] =
      upstreamEmbedUrl && mirrorOk
        ? [{ label: "Mirror Embed", url: upstreamEmbedUrl, available: true }]
        : [];

    const embedFallbacks = dedupeEmbeds([...vostfrEmbeds, ...mirrorList, ...probedBaseEmbeds]);
    const primaryEmbed = embedFallbacks[0]?.url ?? null;

    if (directHits.length === 0) {
      const extractedSources = await extractDirectStreamsFromEmbeds(embedFallbacks, {
        langLabel: data.lang === "fr" && data.audio === "sub" ? "VOSTFR" : data.audio.toUpperCase(),
        streamLang: data.audio === "dub" ? "en" : "ja",
      });
      if (extractedSources.length > 0) {
        return {
          ok: true,
          streamUrl: extractedSources[0]!.url,
          type: extractedSources[0]!.type,
          provider: "SHADOW Stream",
          quality: null,
          subtitles: [],
          sources: extractedSources,
          embedUrl: primaryEmbed,
          embedFallbacks,
          hasFrenchSubtitles: vostfrEmbeds.length > 0,
          isFrenchAudio: false,
          dubFallbackToEnglish,
        };
      }

      return {
        ok: false,
        streamUrl: null,
        type: "hls",
        provider: "SHADOW Stream",
        quality: null,
        subtitles: [],
        embedUrl: primaryEmbed,
        embedFallbacks,
        hasFrenchSubtitles: vostfrEmbeds.length > 0,
        isFrenchAudio: false,
        dubFallbackToEnglish,
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
      const kind = hit.url.includes("/api/proxy/stream") || hit.type === "mp4" ? "stream" : "hls";
      const rewritten = rewriteAnimeProxyPath(hit.url, kind);
      if (seenUrls.has(rewritten)) continue;
      seenUrls.add(rewritten);
      const streamType =
        kind === "stream" || rewritten.startsWith("/api/anilast/stream")
          ? "mp4"
          : inferStreamType(rewritten, hit.type);
      sources.push({
        url: rewritten,
        type: streamType,
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

    // Attach French subtitles for BOTH French SUB (VOSTFR) AND French DUB-to-EN-dub fallback!
    if (data.lang === "fr" && !subtitles.some(isFrenchTrack) && ext?.imdbId) {
      const season = detectAnimeSeasonFromTitles([...titles, ext.frTitle]);
      const frSubs = await fetchFrenchOpenSubtitles({
        imdbId: ext.imdbId,
        episode: data.episode,
        season,
        isMovie: Boolean(data.isMovie || ext.isMovie),
      });
      for (const fs of frSubs) {
        if (!seenSubUrls.has(fs.url)) {
          seenSubUrls.add(fs.url);
          subtitles.push(fs);
        }
      }
    }

    // In English + SUB, ensure English subtitles exist via OpenSubtitles backup if upstream omitted them.
    if (
      data.lang === "en" &&
      data.audio === "sub" &&
      !subtitles.some(isEnglishTrack) &&
      ext?.imdbId
    ) {
      const season = detectAnimeSeasonFromTitles(titles);
      const enSubs = await fetchEnglishOpenSubtitles({
        imdbId: ext.imdbId,
        episode: data.episode,
        season,
        isMovie: Boolean(data.isMovie || ext.isMovie),
      });
      for (const es of enSubs) {
        if (!seenSubUrls.has(es.url)) {
          seenSubUrls.add(es.url);
          subtitles.push(es);
        }
      }
    }

    subtitles.sort((a, b) => trackPriority(b, data.lang) - trackPriority(a, data.lang));
    const hasFrenchSubtitles = subtitles.some(isFrenchTrack);

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
      hasFrenchSubtitles,
      isFrenchAudio: false,
      dubFallbackToEnglish,
    };
  } catch (error) {
    console.error("Anime stream lookup failed", error);
    const probedBaseEmbeds = await filterAvailableEmbeds(baseEmbeds).catch(() => baseEmbeds);
    return {
      ok: false,
      streamUrl: null,
      type: "hls",
      provider: "SHADOW Stream",
      quality: null,
      subtitles: [],
      embedUrl: probedBaseEmbeds[0]?.url ?? null,
      embedFallbacks: probedBaseEmbeds,
      hasFrenchSubtitles: false,
      isFrenchAudio: false,
      dubFallbackToEnglish,
      error: "Stream server temporarily unavailable.",
    };
  }
}

export const getAniLastAnimeStream = createServerFn({ method: "GET" })
  .inputValidator((input) => StreamInputSchema.parse(input))
  .handler(async ({ data }): Promise<AniLastStreamResult> => resolveAnimeStream(data));
