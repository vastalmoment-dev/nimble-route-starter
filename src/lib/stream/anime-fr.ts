import { probeSingleEmbed, type ProbeableEmbed } from "./embed-probe";
import { signMediaProxyUrl, signSubtitleProxyUrl } from "./media-proxy";
import type { StreamSource, SubtitleTrack } from "./resolver";

const ANIME_SAMA_ORIGIN = "https://anime-sama.to";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface AnimeExternalIds {
  imdbId: string | null;
  tmdbId: string | null;
  malId: number | null;
  frTitle: string | null;
  isMovie: boolean;
}

export async function fetchAnimeExternalIds(anilistId: string): Promise<AnimeExternalIds> {
  try {
    const res = await fetch(
      `https://api.ani.zip/mappings?anilist_id=${encodeURIComponent(anilistId)}`,
      {
        headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
        signal: AbortSignal.timeout(3500),
      },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        titles?: { fr?: string };
        mappings?: {
          imdb_id?: string | null;
          themoviedb_id?: string | number | null;
          mal_id?: string | number | null;
          type?: string | null;
        };
      };
      const imdbId =
        json.mappings?.imdb_id && /^tt\d{5,10}$/.test(json.mappings.imdb_id)
          ? json.mappings.imdb_id
          : null;
      const tmdbRaw = json.mappings?.themoviedb_id ? String(json.mappings.themoviedb_id) : null;
      const tmdbId = tmdbRaw && /^\d+$/.test(tmdbRaw) ? tmdbRaw : null;
      const malNum = json.mappings?.mal_id ? Number(json.mappings.mal_id) : NaN;
      const malId = Number.isInteger(malNum) && malNum > 0 ? malNum : null;
      const frTitle = json.titles?.fr?.trim() || null;
      const isMovie = json.mappings?.type?.toUpperCase() === "MOVIE";
      if (imdbId || tmdbId || malId || frTitle) {
        return { imdbId, tmdbId, malId, frTitle, isMovie };
      }
    }
  } catch {
    /* fallback to arm.haglund.dev */
  }

  try {
    const res = await fetch(
      `https://arm.haglund.dev/api/v2/ids?source=anilist&id=${encodeURIComponent(anilistId)}`,
      {
        headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
        signal: AbortSignal.timeout(3000),
      },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        imdb?: string | null;
        themoviedb?: number | null;
        myanimelist?: number | null;
        media?: string | null;
      };
      const imdbId = json.imdb && /^tt\d{5,10}$/.test(json.imdb) ? json.imdb : null;
      const tmdbId = json.themoviedb ? String(json.themoviedb) : null;
      const malId =
        typeof json.myanimelist === "number" && json.myanimelist > 0 ? json.myanimelist : null;
      return {
        imdbId,
        tmdbId,
        malId,
        frTitle: null,
        isMovie: json.media?.toUpperCase() === "MOVIE",
      };
    }
  } catch {
    /* ignore */
  }

  return { imdbId: null, tmdbId: null, malId: null, frTitle: null, isMovie: false };
}

async function fetchOpenSubtitlesByLang(params: {
  imdbId: string;
  episode: number;
  season?: number;
  isMovie?: boolean;
  targetLang: "fr" | "en";
}): Promise<SubtitleTrack[]> {
  const seasonsToTry =
    !params.isMovie && (params.season ?? 1) > 1 ? [params.season!, 1] : [params.season ?? 1];

  const langRegex = params.targetLang === "fr" ? /^(fre|fra|fr)$/i : /^(eng|en)$/i;
  const nameRegex =
    params.targetLang === "fr" ? /\b(french|fran[cç]ais|vostfr)\b/i : /\b(english|anglais)\b/i;

  for (const seasonNum of seasonsToTry) {
    try {
      const subPath = params.isMovie
        ? `movie/${params.imdbId}.json`
        : `series/${params.imdbId}:${seasonNum}:${params.episode}.json`;
      const res = await fetch(`https://opensubtitles-v3.strem.io/subtitles/${subPath}`, {
        headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        subtitles?: { url?: string; lang?: string; subtitleFileName?: string }[];
      };
      const matches = (json.subtitles ?? []).filter(
        (s) =>
          s.url &&
          /^https?:\/\//i.test(s.url) &&
          (langRegex.test((s.lang ?? "").trim()) || nameRegex.test(s.subtitleFileName ?? "")),
      );
      if (matches.length === 0) continue;

      const seen = new Set<string>();
      const out: SubtitleTrack[] = [];
      for (const track of matches) {
        if (!track.url || seen.has(track.url)) continue;
        seen.add(track.url);
        const baseLabel = params.targetLang === "fr" ? "Français" : "English";
        out.push({
          url: signSubtitleProxyUrl(track.url),
          lang: params.targetLang,
          label: out.length === 0 ? baseLabel : `${baseLabel} ${out.length + 1}`,
        });
        if (out.length >= 2) break;
      }
      if (out.length > 0) return out;
    } catch {
      /* try next season or return empty */
    }
  }
  return [];
}

export function fetchFrenchOpenSubtitles(params: {
  imdbId: string;
  episode: number;
  season?: number;
  isMovie?: boolean;
}): Promise<SubtitleTrack[]> {
  return fetchOpenSubtitlesByLang({ ...params, targetLang: "fr" });
}

export function fetchEnglishOpenSubtitles(params: {
  imdbId: string;
  episode: number;
  season?: number;
  isMovie?: boolean;
}): Promise<SubtitleTrack[]> {
  return fetchOpenSubtitlesByLang({ ...params, targetLang: "en" });
}

function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSeasonSuffix(raw: string): string {
  return raw
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[:\-–]\s*(season|saison|part|cour|arc)\s*\d+.*$/i, "")
    .replace(/\s+(season|saison)\s*\d+.*$/i, "")
    .replace(/\s+\d+(st|nd|rd|th)\s+season.*$/i, "")
    .replace(/\s+(the\s+final\s+season|final\s+season).*$/i, "")
    .replace(/\s+(ii|iii|iv|v)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectAnimeSeasonFromTitles(titles: (string | null | undefined)[]): number {
  for (const t of titles) {
    if (!t) continue;
    const m1 = /\b(?:season|saison)\s*(\d+)\b/i.exec(t);
    if (m1?.[1]) return Number(m1[1]);
    const m2 = /\b(\d+)(?:st|nd|rd|th)\s+season\b/i.exec(t);
    if (m2?.[1]) return Number(m2[1]);
    if (/\b(?:final\s+season|the\s+final\s+chapters?)\b/i.test(t)) return 4;
    if (/\bIV\b/.test(t)) return 4;
    if (/\bIII\b/.test(t)) return 3;
    if (/\bII\b/.test(t)) return 2;
  }
  return 1;
}

function scoreCatalogMatch(candidateTitle: string, queries: string[]): number {
  const normCand = normalizeTitle(candidateTitle);
  if (!normCand) return 0;
  let best = 0;
  for (const q of queries) {
    const normQ = normalizeTitle(q);
    if (!normQ) continue;
    if (normCand === normQ) return 1000;
    const qWords = normQ.split(" ").filter((w) => w.length > 1);
    const cWords = normCand.split(" ").filter((w) => w.length > 1);
    if (qWords.length === 0 || cWords.length === 0) continue;
    const matches = qWords.filter((w) => cWords.includes(w)).length;
    const ratio = matches / Math.max(qWords.length, cWords.length);
    const prefixBonus = normCand.startsWith(normQ) || normQ.startsWith(normCand) ? 120 : 0;
    const spinOffPenalty =
      /\b(chuugakkou|junior high|sd|chibi|ova|special|recap|spin)\b/i.test(normCand) &&
      !/\b(chuugakkou|junior high|sd|chibi)\b/i.test(normQ)
        ? -250
        : 0;
    const score = Math.round(ratio * 500) + prefixBonus + spinOffPenalty;
    if (score > best) best = score;
  }
  return best;
}

interface SearchHit {
  url: string;
  title: string;
}

interface PanelSelection {
  path: string;
  localEpisode: number;
}

async function searchAnimeSamaCatalog(queries: string[]): Promise<SearchHit | null> {
  const seenQueries = new Set<string>();
  const searchTerms: string[] = [];
  for (const raw of queries) {
    const clean = stripSeasonSuffix(raw);
    for (const candidate of [clean, raw]) {
      const k = normalizeTitle(candidate);
      if (k.length >= 2 && !seenQueries.has(k)) {
        seenQueries.add(k);
        searchTerms.push(candidate.trim());
      }
    }
  }
  if (searchTerms.length === 0) return null;

  const hits: SearchHit[] = [];
  const settled = await Promise.allSettled(
    searchTerms.slice(0, 3).map(async (term) => {
      const res = await fetch(`${ANIME_SAMA_ORIGIN}/template-php/defaut/fetch.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": BROWSER_UA,
          Origin: ANIME_SAMA_ORIGIN,
          Referer: `${ANIME_SAMA_ORIGIN}/`,
        },
        body: new URLSearchParams({ query: term }).toString(),
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) return [];
      const html = await res.text();
      return [
        ...html.matchAll(
          /href="(https:\/\/anime-sama\.to\/catalogue\/[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g,
        ),
      ].map((m) => ({
        url: m[1]!.replace(/\/+$/, ""),
        title: m[2]!.replace(/<[^>]+>/g, "").trim(),
      }));
    }),
  );

  for (const s of settled) {
    if (s.status === "fulfilled") hits.push(...s.value);
  }
  if (hits.length === 0) return null;

  const dedup = new Map<string, SearchHit>();
  for (const h of hits) {
    if (!dedup.has(h.url)) dedup.set(h.url, h);
  }
  const scored = [...dedup.values()]
    .map((h) => ({ hit: h, score: scoreCatalogMatch(h.title, searchTerms) }))
    .sort((a, b) => b.score - a.score);

  return scored[0] && scored[0].score >= 150 ? scored[0].hit : null;
}

const HOST_PRIORITY_PATTERNS: RegExp[] = [
  /ansembed\.net/i,
  /ok\.ru/i,
  /uqload\./i,
  /iframedream\./i,
  /mp4upload\./i,
  /myvi\./i,
];

function scoreEmbedHost(url: string): number {
  for (let i = 0; i < HOST_PRIORITY_PATTERNS.length; i++) {
    if (HOST_PRIORITY_PATTERNS[i]!.test(url)) return HOST_PRIORITY_PATTERNS.length - i;
  }
  if (/(sibnet|sendvid|vidmoly)/i.test(url)) return -1;
  return 0;
}

function listCandidatePanels(
  catalogueHtml: string,
  seasonHint: number,
  episode: number,
  variant: "vf" | "vostfr",
  isMovie: boolean,
): PanelSelection[] {
  const panels = [...catalogueHtml.matchAll(/panneauAnime\("([^"]+)",\s*"([^"]+)"\)/g)]
    .map((m) => ({ label: m[1]!, path: m[2]! }))
    .filter((p) => p.path !== "url" && p.label.toLowerCase() !== "nom");

  if (panels.length === 0) return [];

  const withVariant = (rawPath: string) =>
    rawPath.replace(/\/(vostfr|vf)\/?$/i, `/${variant}`).replace(/^\/+|\/+$/g, "");

  const ordered: PanelSelection[] = [];
  const seen = new Set<string>();
  const push = (path: string, localEpisode: number) => {
    const clean = withVariant(path);
    const k = `${clean}:${localEpisode}`;
    if (!seen.has(k)) {
      seen.add(k);
      ordered.push({ path: clean, localEpisode });
    }
  };

  if (isMovie) {
    for (const p of panels) {
      if (/\bfilm\b/i.test(p.label) || /^film\//i.test(p.path)) push(p.path, episode);
    }
  }

  // Handle long-running series split by episode ranges like "[Episode 62 à 143]"
  for (const p of panels) {
    const rangeMatch = /\[Episode\s*(\d+)\s*[àa-]\s*(\d+)\]/i.exec(p.label);
    if (rangeMatch?.[1] && rangeMatch?.[2]) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (episode >= start && episode <= end) {
        push(p.path, episode - start + 1);
      }
    }
  }

  for (const p of panels) {
    if (
      new RegExp(`^saison${seasonHint}(?:/|$)`, "i").test(p.path) ||
      new RegExp(`\\bsaison\\s*${seasonHint}\\b`, "i").test(p.label)
    ) {
      push(p.path, episode);
    }
  }

  for (const p of panels) {
    if (/^saison1(?:hs)?(?:\/|$)/i.test(p.path)) {
      push(p.path, episode);
    }
  }

  for (const p of panels) {
    if (!/\b(film|oav|ova|special|kai)\b/i.test(p.label)) {
      push(p.path, episode);
    }
  }

  for (const p of panels) {
    push(p.path, episode);
  }

  return ordered;
}

async function resolveAnimeSamaPanelUrls(hitUrl: string, panel: PanelSelection): Promise<string[]> {
  const epPageUrl = `${hitUrl}/${panel.path}/`;
  const epRes = await fetch(epPageUrl, {
    headers: { "User-Agent": BROWSER_UA, Referer: `${hitUrl}/` },
    signal: AbortSignal.timeout(3500),
  });
  if (!epRes.ok) return [];
  const cookie = epRes.headers.get("set-cookie");
  const epHtml = await epRes.text();

  const jeton = /var epsJeton = "([^"]+)"/.exec(epHtml)?.[1];
  if (!jeton) return [];

  const epIdx = Math.max(0, panel.localEpisode - 1);
  const lienIds: string[] = [];
  for (let srv = 1; srv <= 8; srv++) {
    const arrMatch = new RegExp(`var eps${srv}\\s*=\\s*\\[([^\\]]+)\\]`).exec(epHtml);
    if (!arrMatch?.[1]) continue;
    const items = [...arrMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    const entry = items[epIdx];
    if (!entry) continue;
    const lienMatch = /^lien:(\d+)$/.exec(entry);
    if (lienMatch?.[1]) {
      lienIds.push(lienMatch[1]);
    } else if (/^https?:\/\//i.test(entry)) {
      lienIds.push(entry);
    }
  }

  if (lienIds.length === 0) return [];

  const resolvedUrls = await Promise.all(
    lienIds.map(async (item) => {
      if (/^https?:\/\//i.test(item)) return item;
      try {
        const lr = await fetch(
          `${ANIME_SAMA_ORIGIN}/api/lien.php?j=${encodeURIComponent(jeton)}&l=${encodeURIComponent(item)}`,
          {
            headers: {
              "User-Agent": BROWSER_UA,
              Referer: epPageUrl,
              ...(cookie ? { Cookie: cookie } : {}),
            },
            signal: AbortSignal.timeout(3200),
          },
        );
        if (!lr.ok) return null;
        const json = (await lr.json()) as { u?: string };
        return json.u && /^https?:\/\//i.test(json.u) ? json.u : null;
      } catch {
        return null;
      }
    }),
  );

  return [...new Set(resolvedUrls.filter((u): u is string => Boolean(u)))];
}

export async function resolveAnimeSamaEmbeds(params: {
  titles: (string | null | undefined)[];
  episode: number;
  variant: "vf" | "vostfr";
  isMovie?: boolean;
}): Promise<ProbeableEmbed[]> {
  const cleanTitles = params.titles.map((t) => t?.trim() ?? "").filter((t) => t.length >= 2);
  if (cleanTitles.length === 0) return [];

  try {
    const hit = await searchAnimeSamaCatalog(cleanTitles);
    if (!hit) return [];

    const catRes = await fetch(`${hit.url}/`, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(3500),
    });
    if (!catRes.ok) return [];
    const catHtml = await catRes.text();

    const seasonHint = detectAnimeSeasonFromTitles(cleanTitles);
    const panels = listCandidatePanels(
      catHtml,
      seasonHint,
      params.episode,
      params.variant,
      Boolean(params.isMovie),
    );
    if (panels.length === 0) return [];

    const prefix = params.variant === "vf" ? "VF" : "VOSTFR";
    let fallbackUrls: string[] = [];

    for (const panel of panels.slice(0, 3)) {
      const uniqueUrls = await resolveAnimeSamaPanelUrls(hit.url, panel);
      if (uniqueUrls.length === 0) continue;
      if (fallbackUrls.length === 0) fallbackUrls = uniqueUrls;

      const sortedCandidates = [...uniqueUrls].sort(
        (a, b) => scoreEmbedHost(b) - scoreEmbedHost(a),
      );

      const verified = await Promise.all(
        sortedCandidates.map(async (u) => ({
          url: u,
          ok: await probeSingleEmbed(u, 2500),
        })),
      );
      const workingUrls = verified.filter((v) => v.ok).map((v) => v.url);
      if (workingUrls.length > 0) {
        return workingUrls.map((u, idx) => ({
          label: `${prefix} · Lecteur ${idx + 1}`,
          url: u,
          available: true,
        }));
      }
    }

    return fallbackUrls.map((u, idx) => ({
      label: `${prefix} · Lecteur ${idx + 1}`,
      url: u,
      available: false,
    }));
  } catch {
    return [];
  }
}

const VOSTFREE_ORIGIN = "https://ipv4.vostfree.ws";

function buildVostfreePlayerUrl(playerClass: string, contentId: string): string | null {
  const id = contentId.trim();
  if (!id) return null;
  if (playerClass.includes("new_player_ok")) {
    return /^https?:\/\//i.test(id) ? id : `https://www.ok.ru/videoembed/${id}`;
  }
  if (playerClass.includes("new_player_uqload")) {
    return /^https?:\/\//i.test(id) ? id : `https://uqload.vc/embed-${id}.html`;
  }
  if (playerClass.includes("new_player_gtv")) {
    return /^https?:\/\//i.test(id) ? id : `https://iframedream.com/embed/${id}.html`;
  }
  if (playerClass.includes("new_player_mp4")) {
    return /^https?:\/\//i.test(id) ? id : `https://www.mp4upload.com/embed-${id}.html`;
  }
  if (playerClass.includes("new_player_vip")) {
    return /^https?:\/\//i.test(id) ? id : null;
  }
  if (playerClass.includes("new_player_sibnet")) {
    return /^https?:\/\//i.test(id) ? id : `https://video.sibnet.ru/shell.php?videoid=${id}`;
  }
  // Skip legacy new_player_myvi because myvi embeds rely on blocked HTTP/Flash players.
  return null;
}

export async function resolveVostfreeEmbeds(params: {
  titles: (string | null | undefined)[];
  episode: number;
  variant: "vf" | "vostfr";
  isMovie?: boolean;
}): Promise<ProbeableEmbed[]> {
  const cleanTitles = params.titles.map((t) => t?.trim() ?? "").filter((t) => t.length >= 2);
  if (cleanTitles.length === 0) return [];

  const searchTerms: string[] = [];
  const seenTerms = new Set<string>();
  for (const raw of cleanTitles) {
    const clean = stripSeasonSuffix(raw);
    for (const cand of [clean, raw]) {
      const k = normalizeTitle(cand);
      if (k.length >= 2 && !seenTerms.has(k)) {
        seenTerms.add(k);
        searchTerms.push(cand.trim());
      }
    }
  }
  if (searchTerms.length === 0) return [];

  try {
    const candidates: { url: string; title: string; isVf: boolean; score: number }[] = [];
    const seenPageUrls = new Set<string>();

    const searchSettled = await Promise.allSettled(
      searchTerms.slice(0, 2).map(async (term) => {
        const res = await fetch(`${VOSTFREE_ORIGIN}/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": BROWSER_UA,
            Origin: VOSTFREE_ORIGIN,
            Referer: `${VOSTFREE_ORIGIN}/`,
          },
          body: new URLSearchParams({
            do: "search",
            subaction: "search",
            story: term,
          }).toString(),
          signal: AbortSignal.timeout(3500),
        });
        if (!res.ok) return [];
        const html = await res.text();
        return [
          ...html.matchAll(
            /href="(https?:\/\/(?:ipv4\.)?vostfree\.ws\/\d+-[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi,
          ),
        ].map((m) => ({
          url: m[1]!.replace(/^http:\/\//i, "https://"),
          title: m[2]!
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        }));
      }),
    );

    for (const s of searchSettled) {
      if (s.status !== "fulfilled") continue;
      for (const hit of s.value) {
        if (!hit.url || seenPageUrls.has(hit.url) || hit.title.length < 2) continue;
        seenPageUrls.add(hit.url);
        const hay = `${hit.url} ${hit.title}`.toLowerCase();
        const isVf = /-vf(?:[.-]|$)|\bvf\b|\bfrench\b/i.test(hay);
        const isMovieHit = /\bfilm\b|\bmovie\b/i.test(hay);
        if (params.variant === "vf" && !isVf) continue;
        if (params.variant === "vostfr" && isVf) continue;

        const cleanCandTitle = hit.title.replace(/\b(vf|vostfr|french)\b/gi, "").trim();
        let score = scoreCatalogMatch(cleanCandTitle, searchTerms);
        if (params.isMovie && isMovieHit) score += 120;
        if (!params.isMovie && isMovieHit) score -= 220;
        candidates.push({ url: hit.url, title: hit.title, isVf, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.find((c) => c.score >= 150);
    if (!top) return [];

    const pageRes = await fetch(top.url, {
      headers: { "User-Agent": BROWSER_UA, Referer: `${VOSTFREE_ORIGIN}/` },
      signal: AbortSignal.timeout(3500),
    });
    if (!pageRes.ok) return [];
    const html = await pageRes.text();

    // Match the option tag for Episode N to locate its button_box container id (e.g. buttons_1)
    let boxId = `buttons_${params.episode}`;
    const epOptions = [
      ...html.matchAll(/<option[^>]+value="(buttons_\d+)"[^>]*>([\s\S]*?)<\/option>/gi),
    ];
    const matchedOpt = epOptions.find((m) => {
      const numMatch = /\b0*(\d+)\b/.exec(m[2]!);
      return numMatch && Number(numMatch[1]) === params.episode;
    });
    if (matchedOpt?.[1]) boxId = matchedOpt[1];

    const boxRegex = new RegExp(
      `<div[^>]+id="${boxId}"[^>]*>([\\s\\S]*?)<\\/div>\\s*<\\/div>`,
      "i",
    );
    const boxMatch = boxRegex.exec(html);
    const boxScope =
      boxMatch?.[1] ??
      (() => {
        const idx = html.indexOf(`id="${boxId}"`);
        if (idx === -1) return "";
        const nextBox = html.indexOf(`id="buttons_`, idx + 12);
        return html.slice(idx, nextBox > idx ? nextBox : idx + 2500);
      })();
    if (!boxScope) return [];

    const contentMap = new Map<string, string>();
    for (const cm of html.matchAll(/<div[^>]+id="content_(player_\d+)"[^>]*>([\s\S]*?)<\/div>/gi)) {
      contentMap.set(cm[1]!, cm[2]!.trim());
    }

    const rawUrls: string[] = [];
    for (const pm of boxScope.matchAll(/<div[^>]+id="(player_\d+)"[^>]+class="([^"]+)"/gi)) {
      const contentVal = contentMap.get(pm[1]!);
      if (!contentVal) continue;
      const built = buildVostfreePlayerUrl(pm[2]!, contentVal);
      if (built) rawUrls.push(built);
    }

    const uniqueUrls = [...new Set(rawUrls)].sort((a, b) => scoreEmbedHost(b) - scoreEmbedHost(a));
    if (uniqueUrls.length === 0) return [];

    const verified = await Promise.all(
      uniqueUrls.slice(0, 6).map(async (u) => ({
        url: u,
        ok: await probeSingleEmbed(u, 2500),
      })),
    );
    const workingUrls = verified.filter((v) => v.ok).map((v) => v.url);
    const prefix = params.variant === "vf" ? "VF" : "VOSTFR";

    return workingUrls.map((u, idx) => ({
      label: `${prefix} · Vostfree ${idx + 1}`,
      url: u,
      available: true,
    }));
  } catch {
    return [];
  }
}

export async function resolveFrenchAnimeSources(params: {
  titles: (string | null | undefined)[];
  episode: number;
  variant: "vf" | "vostfr";
  isMovie?: boolean;
}): Promise<ProbeableEmbed[]> {
  const [samaRes, vostfreeRes] = await Promise.allSettled([
    resolveAnimeSamaEmbeds(params),
    resolveVostfreeEmbeds(params),
  ]);
  const sama = samaRes.status === "fulfilled" ? samaRes.value : [];
  const vostfree = vostfreeRes.status === "fulfilled" ? vostfreeRes.value : [];

  const merged: ProbeableEmbed[] = [];
  const seen = new Set<string>();
  const combined = [...sama, ...vostfree].sort(
    (a, b) => Number(b.available !== false) - Number(a.available !== false),
  );
  for (const item of combined) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    merged.push(item);
  }
  return merged;
}

export async function extractDirectStreamsFromEmbeds(
  embeds: ProbeableEmbed[],
  opts?: { langLabel?: string; streamLang?: string },
): Promise<StreamSource[]> {
  const candidates = embeds
    .filter(
      (e) =>
        e.available !== false &&
        /(ansembed\.net|uqload\.|iframedream\.|mp4upload\.|vidcore\.io|vidsrc\.su|vidnest\.fun|vidlink\.pro)/i.test(
          e.url,
        ),
    )
    .slice(0, 4);

  if (candidates.length === 0) return [];

  const extracted: StreamSource[] = [];
  const seen = new Set<string>();

  await Promise.allSettled(
    candidates.map(async (emb) => {
      try {
        const origin = new URL(emb.url).origin;
        const res = await fetch(emb.url, {
          headers: {
            "User-Agent": BROWSER_UA,
            Referer: `${origin}/`,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return;
        const body = await res.text();
        const matches =
          body.match(/https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mp4)(?:\?[^"'\\\s<>]*)?/gi) ?? [];

        for (const rawUrl of matches.slice(0, 4)) {
          const clean = rawUrl.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
          if (seen.has(clean)) continue;
          seen.add(clean);

          const isMp4 = /\.mp4(\?|$)/i.test(clean);
          const check = await fetch(clean, {
            method: isMp4 ? "HEAD" : "GET",
            headers: {
              "User-Agent": BROWSER_UA,
              Referer: `${origin}/`,
              Origin: origin,
              Accept: "*/*",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(3500),
          });
          if (!check.ok) continue;

          if (!isMp4) {
            const manifest = await check.text();
            if (!manifest.includes("#EXTM3U")) continue;
          } else {
            const ct = (check.headers.get("content-type") ?? "").toLowerCase();
            if (ct.includes("text/html")) continue;
          }

          extracted.push({
            url: signMediaProxyUrl(clean, `${origin}/`),
            type: isMp4 ? "mp4" : "hls",
            label: `${emb.label}${opts?.langLabel ? ` · ${opts.langLabel}` : ""}`,
            lang: opts?.streamLang ?? null,
          });
          return;
        }
      } catch {
        /* ignore blocked embed extraction */
      }
    }),
  );

  return extracted;
}
