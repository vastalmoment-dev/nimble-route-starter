import { probeSingleEmbed, type ProbeableEmbed } from "./embed-probe";
import { signSubtitleProxyUrl } from "./media-proxy";
import type { SubtitleTrack } from "./resolver";

const ANIME_SAMA_ORIGIN = "https://anime-sama.to";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface AnimeExternalIds {
  imdbId: string | null;
  tmdbId: string | null;
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
          type?: string | null;
        };
      };
      const imdbId =
        json.mappings?.imdb_id && /^tt\d{5,10}$/.test(json.mappings.imdb_id)
          ? json.mappings.imdb_id
          : null;
      const tmdbRaw = json.mappings?.themoviedb_id ? String(json.mappings.themoviedb_id) : null;
      const tmdbId = tmdbRaw && /^\d+$/.test(tmdbRaw) ? tmdbRaw : null;
      const frTitle = json.titles?.fr?.trim() || null;
      const isMovie = json.mappings?.type?.toUpperCase() === "MOVIE";
      if (imdbId || tmdbId || frTitle) {
        return { imdbId, tmdbId, frTitle, isMovie };
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
        media?: string | null;
      };
      const imdbId = json.imdb && /^tt\d{5,10}$/.test(json.imdb) ? json.imdb : null;
      const tmdbId = json.themoviedb ? String(json.themoviedb) : null;
      return {
        imdbId,
        tmdbId,
        frTitle: null,
        isMovie: json.media?.toUpperCase() === "MOVIE",
      };
    }
  } catch {
    /* ignore */
  }

  return { imdbId: null, tmdbId: null, frTitle: null, isMovie: false };
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

interface PanelSelection {
  path: string;
  localEpisode: number;
}

function selectAnimeSamaPanel(
  catalogueHtml: string,
  seasonHint: number,
  episode: number,
  variant: "vf" | "vostfr",
  isMovie: boolean,
): PanelSelection | null {
  const panels = [...catalogueHtml.matchAll(/panneauAnime\("([^"]+)",\s*"([^"]+)"\)/g)]
    .map((m) => ({ label: m[1]!, path: m[2]! }))
    .filter((p) => p.path !== "url" && p.label.toLowerCase() !== "nom");

  if (panels.length === 0) return null;

  const withVariant = (rawPath: string) =>
    rawPath.replace(/\/(vostfr|vf)\/?$/i, `/${variant}`).replace(/^\/+|\/+$/g, "");

  if (isMovie) {
    const film = panels.find((p) => /\bfilm\b/i.test(p.label) || /^film\//i.test(p.path));
    if (film) return { path: withVariant(film.path), localEpisode: episode };
  }

  // Handle long-running series split by episode ranges like "[Episode 62 à 143]"
  for (const p of panels) {
    const rangeMatch = /\[Episode\s*(\d+)\s*[àa-]\s*(\d+)\]/i.exec(p.label);
    if (rangeMatch?.[1] && rangeMatch?.[2]) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (episode >= start && episode <= end) {
        return { path: withVariant(p.path), localEpisode: episode - start + 1 };
      }
    }
  }

  const seasonMatch = panels.find(
    (p) =>
      new RegExp(`^saison${seasonHint}(?:/|$)`, "i").test(p.path) ||
      new RegExp(`\\bsaison\\s*${seasonHint}\\b`, "i").test(p.label),
  );
  if (seasonMatch) {
    return { path: withVariant(seasonMatch.path), localEpisode: episode };
  }

  const s1 = panels.find((p) => /^saison1(?:\/|$)/i.test(p.path));
  if (s1) return { path: withVariant(s1.path), localEpisode: episode };

  return { path: withVariant(panels[0]!.path), localEpisode: episode };
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
    const panel = selectAnimeSamaPanel(
      catHtml,
      seasonHint,
      params.episode,
      params.variant,
      Boolean(params.isMovie),
    );
    if (!panel) return [];

    const epPageUrl = `${hit.url}/${panel.path}/`;
    const epRes = await fetch(epPageUrl, {
      headers: { "User-Agent": BROWSER_UA, Referer: `${hit.url}/` },
      signal: AbortSignal.timeout(3500),
    });
    if (!epRes.ok) return [];
    const cookie = epRes.headers.get("set-cookie");
    const epHtml = await epRes.text();

    const jeton = /var epsJeton = "([^"]+)"/.exec(epHtml)?.[1];
    if (!jeton) return [];

    const epIdx = Math.max(0, panel.localEpisode - 1);
    const lienIds: string[] = [];
    for (let srv = 1; srv <= 4; srv++) {
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

    const uniqueUrls = [...new Set(resolvedUrls.filter((u): u is string => Boolean(u)))];
    if (uniqueUrls.length === 0) return [];

    const verified = await Promise.all(
      uniqueUrls.map(async (u) => ({
        url: u,
        ok: await probeSingleEmbed(u, 2500),
      })),
    );
    const workingUrls = verified.filter((v) => v.ok).map((v) => v.url);
    const finalUrls = workingUrls.length > 0 ? workingUrls : uniqueUrls;
    const prefix = params.variant === "vf" ? "VF" : "VOSTFR";

    return finalUrls.map((u, idx) => ({
      label: `${prefix} · Lecteur ${idx + 1}`,
      url: u,
      available: workingUrls.includes(u),
    }));
  } catch {
    return [];
  }
}
