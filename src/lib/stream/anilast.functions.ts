import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  detectAnimeSeasonFromTitles,
  extractDirectStreamsAndSubsFromEmbeds,
  extractDirectStreamsFromEmbeds,
  extractMegaplayDirectStream,
  fetchAnimeExternalIds,
  fetchEnglishOpenSubtitles,
  fetchFrenchOpenSubtitles,
  resolveFrenchAnimeSources,
  type MegaplayExtractionResult,
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

const MIN_FULL_MP4_BYTES = 2_000_000;

function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const m = /\/(\d+)\s*$/.exec(header.trim());
  if (!m?.[1]) return null;
  const total = Number(m[1]);
  return Number.isFinite(total) ? total : null;
}

async function isPlayableMp4DirectHit(rawUrl: string): Promise<boolean> {
  const probeUrl = rawUrl.startsWith("/api/proxy/") ? `${ANILAST_ORIGIN}${rawUrl}` : rawUrl;
  if (!/^https?:\/\//i.test(probeUrl)) return false;

  const probeReq = async (method: "HEAD" | "GET", range?: string) =>
    fetch(probeUrl, {
      method,
      headers: {
        ...ANILAST_HEADERS,
        Accept: "*/*",
        ...(range ? { Range: range } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(4500),
    });

  try {
    let res = await probeReq("GET", "bytes=0-0");
    if (!res.ok && res.status !== 206) {
      res = await probeReq("HEAD");
    }
    if (!res.ok && res.status !== 206) return false;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("text/html")) return false;
    const total =
      parseContentRangeTotal(res.headers.get("content-range")) ??
      Number(res.headers.get("content-length") ?? 0);
    if (Number.isFinite(total) && total > 0 && total < MIN_FULL_MP4_BYTES) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function canonicalUpstreamPathKey(rawUrl: string): string {
  const decoded = decodeSafe(rawUrl);
  const hashPair = /\/([a-f0-9]{32}\/[a-f0-9]{32})\//i.exec(decoded)?.[1]?.toLowerCase();
  if (hashPair) return `hash:${hashPair}`;
  const nested = /[?&]url=([^&]+)/i.exec(decoded)?.[1];
  const inner = nested ? decodeSafe(nested) : decoded;
  return inner.split("?")[0]!.toLowerCase();
}

function isNonDialogueSubtitle(s: { url?: string; lang?: string; label?: string }): boolean {
  const label = (s.label ?? "").toLowerCase();
  const url = (s.url ?? "").toLowerCase();
  return /\bthumb(nail)?s?\b/.test(label) || /(?:sprite|thumbnails)\.vtt/i.test(url);
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

    const initialMegaplayUrl =
      effectiveMalId && effectiveMalId > 0
        ? `https://megaplay.buzz/stream/mal/${effectiveMalId}/${data.episode}/${data.audio}`
        : null;
    const megaplayPromise: Promise<MegaplayExtractionResult | null> = initialMegaplayUrl
      ? extractMegaplayDirectStream(initialMegaplayUrl, {
          requestedAudio: data.audio,
          label: "SHADOW Server 1",
          langLabel: data.audio.toUpperCase(),
          streamLang: data.audio === "dub" ? "en" : "ja",
        }).catch(() => null)
      : Promise.resolve(null);

    const [settledInitial, ext, vostfrEmbeds, initialMp] = await Promise.all([
      Promise.allSettled(
        candidates.map(async (lookupId) => ({
          lookupId,
          hit: await queryAnimeEndpoint(lookupId, data),
        })),
      ),
      extPromise,
      vostfrPromise,
      megaplayPromise,
    ]);

    const settled = [...settledInitial];
    let megaplayUrl = initialMegaplayUrl;
    let megaplayResult = initialMp;

    if (!effectiveMalId && ext?.malId) {
      effectiveMalId = ext.malId;
      megaplayUrl = `https://megaplay.buzz/stream/mal/${effectiveMalId}/${data.episode}/${data.audio}`;
      const [extraAnilast, extraMp] = await Promise.all([
        !candidates.includes(effectiveMalId)
          ? queryAnimeEndpoint(effectiveMalId, data)
              .then((hit) => ({ lookupId: effectiveMalId!, hit }))
              .catch(() => null)
          : Promise.resolve(null),
        extractMegaplayDirectStream(megaplayUrl, {
          requestedAudio: data.audio,
          label: "SHADOW Server 1",
          langLabel: data.audio.toUpperCase(),
          streamLang: data.audio === "dub" ? "en" : "ja",
        }).catch(() => null),
      ]);
      if (extraAnilast) {
        settled.push({ status: "fulfilled", value: extraAnilast });
      }
      if (extraMp) {
        megaplayResult = extraMp;
      }
      baseEmbeds = buildAnimeEmbedFallbacks({
        anilistId: data.anilistId,
        malId: effectiveMalId,
        episode: data.episode,
        audio: data.audio,
      });
    }

    const rawDirectHits: { lookupId: string | number; hit: AniLastApiResponse }[] = [];
    let upstreamEmbedUrl: string | null = null;
    for (const r of settled) {
      if (r.status !== "fulfilled" || !r.value?.hit?.url) continue;
      const hit = r.value.hit;
      if (hit.type === "embed") {
        // Never allow a sub-only upstream embed when the viewer explicitly chose DUB.
        if (data.audio === "dub" && looksSubOnlyResponse(hit)) continue;
        upstreamEmbedUrl ??= hit.url!;
      } else {
        // When DUB is requested, reject hits explicitly tagged as Sub-only so we fall through to real Dub streams.
        if (data.audio === "dub" && looksSubOnlyResponse(hit)) continue;
        rawDirectHits.push({ lookupId: r.value.lookupId, hit });
      }
    }

    // Validate MP4 / stream-proxy direct hits so stub/blocked tiny clips (e.g. 88 KB placeholders) never claim Server 1.
    let directHits = (
      await Promise.all(
        rawDirectHits.map(async (entry) => {
          const isMp4Candidate =
            entry.hit.type === "mp4" || Boolean(entry.hit.url?.includes("/api/proxy/stream"));
          if (isMp4Candidate) {
            const okMp4 = await isPlayableMp4DirectHit(entry.hit.url!);
            if (!okMp4) return null;
          }
          return entry;
        }),
      )
    ).filter((x): x is { lookupId: string | number; hit: AniLastApiResponse } => x !== null);

    // Detect silent dub-to-sub fallback (e.g. anilast returning the exact Japanese sub URL for lang=dub).
    if (data.audio === "dub" && directHits.length > 0) {
      const suspectEntries = directHits.filter(
        ({ hit }) =>
          !looksExplicitDubResponse(hit) &&
          hit.type !== "mp4" &&
          !hit.url?.includes("/api/proxy/stream"),
      );
      if (suspectEntries.length > 0) {
        const subLookupId = suspectEntries[0]!.lookupId ?? candidates[0]!;
        const subCompare = await queryAnimeEndpoint(subLookupId, { ...data, audio: "sub" }).catch(
          () => null,
        );
        if (subCompare?.url) {
          directHits = directHits.filter(({ hit }) => hit.url !== subCompare.url);
        }
      }
    }

    if (data.audio === "dub" && directHits.length > 1) {
      directHits.sort(
        (a, b) => Number(looksExplicitDubResponse(b.hit)) - Number(looksExplicitDubResponse(a.hit)),
      );
    }

    // If upstream returned a non-MAL MegaPlay embed (or different URL), extract it too if we still lack MegaPlay.
    if (
      !megaplayResult?.source &&
      upstreamEmbedUrl &&
      /^https?:\/\/(?:www\.)?megaplay\.buzz\//i.test(upstreamEmbedUrl) &&
      upstreamEmbedUrl !== megaplayUrl
    ) {
      megaplayResult = await extractMegaplayDirectStream(upstreamEmbedUrl, {
        requestedAudio: data.audio,
        label: "SHADOW Server 1",
        langLabel: data.audio.toUpperCase(),
        streamLang: data.audio === "dub" ? "en" : "ja",
      }).catch(() => null);
    }

    // Probe embed fallbacks without firing redundant requests to MegaPlay if we already checked it.
    const embedAlreadyKnown = new Map<string, boolean>();
    if (megaplayUrl && megaplayResult) {
      embedAlreadyKnown.set(megaplayUrl, megaplayResult.embedAlive);
    }
    const embedsToProbe = baseEmbeds.filter((e) => !embedAlreadyKnown.has(e.url));
    const probedOtherEmbeds = await filterAvailableEmbeds(embedsToProbe);
    const probedBaseEmbeds = baseEmbeds
      .map((e) => {
        if (embedAlreadyKnown.has(e.url)) {
          return { ...e, available: embedAlreadyKnown.get(e.url)! };
        }
        return (
          probedOtherEmbeds.find((p) => p.url === e.url) ?? {
            ...e,
            available: false,
          }
        );
      })
      .filter((e) => e.available || probedOtherEmbeds.every((p) => !p.available));

    const workingBaseEmbeds = probedBaseEmbeds.filter((e) => e.available);
    const resolvedBaseEmbeds = workingBaseEmbeds.length > 0 ? workingBaseEmbeds : probedBaseEmbeds;

    const isSandboxBlockedHost =
      Boolean(upstreamEmbedUrl) &&
      /(^|\.)(2embed\.cc|vidsrc\.me|vidsrc\.buzz)\b/i.test(upstreamEmbedUrl!);
    const mirrorOk =
      upstreamEmbedUrl && !isSandboxBlockedHost
        ? embedAlreadyKnown.has(upstreamEmbedUrl)
          ? embedAlreadyKnown.get(upstreamEmbedUrl)!
          : await probeSingleEmbed(upstreamEmbedUrl, 2400)
        : false;
    const mirrorList: AnimeEmbedFallback[] =
      upstreamEmbedUrl && mirrorOk
        ? [{ label: "Mirror Embed", url: upstreamEmbedUrl, available: true }]
        : [];

    const embedFallbacks = dedupeEmbeds([...vostfrEmbeds, ...mirrorList, ...resolvedBaseEmbeds]);
    const primaryEmbed = embedFallbacks[0]?.url ?? null;

    // Collect combined direct StreamSources (direct MegaPlay 1080p stream + AniLast direct hits + other extractable embeds).
    const canonicalSeen = new Set<string>();
    const rawSources: { source: StreamSource; quality?: string | null; priority: number }[] = [];

    if (megaplayResult?.source && megaplayResult.rawUpstreamUrl) {
      const canon = canonicalUpstreamPathKey(megaplayResult.rawUpstreamUrl);
      if (!canonicalSeen.has(canon)) {
        canonicalSeen.add(canon);
        rawSources.push({
          source: megaplayResult.source,
          quality: "HD",
          priority: 4,
        });
      }
    }

    for (const { hit } of directHits) {
      if (!hit.url) continue;
      const canon = canonicalUpstreamPathKey(hit.url);
      if (canonicalSeen.has(canon)) continue;
      canonicalSeen.add(canon);

      const kind = hit.url.includes("/api/proxy/stream") || hit.type === "mp4" ? "stream" : "hls";
      const rewritten = rewriteAnimeProxyPath(hit.url, kind);
      const streamType =
        kind === "stream" || rewritten.startsWith("/api/anilast/stream")
          ? "mp4"
          : inferStreamType(rewritten, hit.type);
      const isAnikoto = hit.provider === "anikoto" || hit.url.includes("fetch.nexabloom.top");
      rawSources.push({
        source: {
          url: rewritten,
          type: streamType,
          label: `Server ${rawSources.length + 1} · ${data.audio.toUpperCase()}`,
          lang: data.audio,
        },
        quality: hit.quality ?? null,
        priority: isAnikoto ? 3 : 1,
      });
    }

    let extraExtractedSubs: SubtitleTrack[] = [];
    if (rawSources.length === 0) {
      const fallbackExtracted = await extractDirectStreamsAndSubsFromEmbeds(embedFallbacks, {
        langLabel: data.lang === "fr" && data.audio === "sub" ? "VOSTFR" : data.audio.toUpperCase(),
        streamLang: data.audio === "dub" ? "en" : "ja",
        requestedAudio: data.audio,
      });
      extraExtractedSubs = fallbackExtracted.subtitles;
      fallbackExtracted.sources.forEach((src, i) => {
        const up = fallbackExtracted.upstreamUrls[i] ?? src.url;
        const canon = canonicalUpstreamPathKey(up);
        if (canonicalSeen.has(canon)) return;
        canonicalSeen.add(canon);
        rawSources.push({ source: src, quality: null, priority: 1 });
      });
    }

    if (rawSources.length === 0) {
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

    // Order higher-quality 1080p multi-sub streams (Anikoto / MegaPlay) first on Server 1, keeping backup CDNs on Server 2.
    rawSources.sort((a, b) => b.priority - a.priority);
    const seenUrls = new Set<string>();
    const sources: StreamSource[] = [];
    for (const entry of rawSources) {
      if (seenUrls.has(entry.source.url)) continue;
      seenUrls.add(entry.source.url);
      const keepVostfr = entry.source.label.includes("VOSTFR");
      sources.push({
        ...entry.source,
        label: keepVostfr
          ? entry.source.label
          : `Server ${sources.length + 1} · ${data.audio.toUpperCase()}`,
      });
    }

    const primarySource = sources[0]!;
    const primaryQuality =
      rawSources.find((r) => r.source.url === primarySource.url)?.quality ?? null;

    const canonicalSubtitleKey = (rawUrl: string): string => {
      if (rawUrl.startsWith("/api/media/sub?token=")) {
        try {
          const tok = new URL(rawUrl, "http://localhost").searchParams.get("token");
          const body = tok?.split(".")[0];
          if (body) {
            const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
              u?: string;
            };
            if (parsed.u) return canonicalUpstreamPathKey(parsed.u);
          }
        } catch {
          /* fall back to URL key */
        }
      }
      return canonicalUpstreamPathKey(rawUrl);
    };

    const mergedRawSubs = [
      ...(megaplayResult?.subtitles ?? []),
      ...directHits.flatMap((h) => h.hit.subtitles ?? []),
      ...extraExtractedSubs,
    ];
    const seenSubKeys = new Set<string>();
    const subtitles: SubtitleTrack[] = [];
    for (const s of mergedRawSubs) {
      if (!s.url || isNonDialogueSubtitle(s)) continue;
      const url =
        s.url.startsWith("/api/media/") || s.url.startsWith("/api/anilast/")
          ? s.url
          : rewriteAnimeProxyPath(s.url, "subtitle");
      const subKey = canonicalSubtitleKey(url);
      if (seenSubKeys.has(subKey)) continue;
      seenSubKeys.add(subKey);
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
        const subKey = canonicalSubtitleKey(fs.url);
        if (!seenSubKeys.has(subKey)) {
          seenSubKeys.add(subKey);
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
        const subKey = canonicalSubtitleKey(es.url);
        if (!seenSubKeys.has(subKey)) {
          seenSubKeys.add(subKey);
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
      quality: primaryQuality,
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
  .handler(async ({ data }): Promise<AniLastStreamResult> => {
    try {
      setResponseHeader("Cache-Control", "no-store");
    } catch {
      /* ignore when invoked outside HTTP request context */
    }
    return resolveAnimeStream(data);
  });
