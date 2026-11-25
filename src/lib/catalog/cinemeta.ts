import { itemKey, type Episode, type MediaDetail, type MediaItem, type SectionId } from "./types";

const CINEMETA_ORIGIN = "https://v3-cinemeta.strem.io";
const METAHUB_POSTER = "https://images.metahub.space/poster/medium";
const METAHUB_POSTER_HD = "https://images.metahub.space/poster/large";
const METAHUB_BG = "https://images.metahub.space/background/medium";

export interface CinemetaVideo {
  id: string;
  name?: string | null;
  title?: string | null;
  season: number;
  number?: number | null;
  episode?: number | null;
  overview?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  released?: string | null;
  firstAired?: string | null;
}

export interface CinemetaMeta {
  id: string;
  imdb_id?: string | null;
  moviedb_id?: number | string | null;
  type: "movie" | "series";
  name: string;
  poster?: string | null;
  background?: string | null;
  releaseInfo?: string | null;
  year?: string | number | null;
  imdbRating?: string | number | null;
  genres?: string[] | null;
  genre?: string[] | null;
  description?: string | null;
  country?: string | null;
  language?: string | null;
  runtime?: string | null;
  status?: string | null;
  cast?: string[] | null;
  popularity?: number | null;
  videos?: CinemetaVideo[] | null;
}

const IMDB_ID_RE = /^tt\d{5,10}$/;

function parseYear(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const match = /\b(19|20)\d{2}\b/.exec(raw);
    if (match) return Number(match[0]);
  }
  return null;
}

function parseRuntime(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /(\d+)/.exec(raw);
  return m ? Number(m[1]) : null;
}

function parseRating(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(10, n) : null;
}

export function inferSectionFromMeta(m: CinemetaMeta): SectionId {
  const genres = (m.genres ?? m.genre ?? []).map((g) => g.toLowerCase());
  const country = (m.country ?? "").toLowerCase();
  const lang = (m.language ?? "").toLowerCase();
  const text = `${m.name} ${m.description ?? ""}`.toLowerCase();

  if (genres.includes("animation")) {
    if (country.includes("japan") && !/ninja turtles|boss baby|bad guys/i.test(m.name)) {
      return "anime";
    }
    return "cartoons";
  }
  if (country.includes("korea") || lang.includes("korean")) {
    return "k-dramas";
  }
  if (lang.includes("telugu") || /\btelugu\b|\bhyderabad\b/i.test(text)) {
    return "tollywood";
  }
  if (country.includes("india") || lang.includes("hindi") || lang.includes("tamil")) {
    return "bollywood";
  }
  return "hollywood";
}

export function mapCinemetaItem(m: CinemetaMeta, sectionOverride?: SectionId): MediaItem | null {
  const imdbId = IMDB_ID_RE.test(m.imdb_id ?? "")
    ? m.imdb_id!
    : IMDB_ID_RE.test(m.id)
      ? m.id
      : null;
  if (!imdbId) return null;

  const mediaType: "tv" | "movie" = m.type === "movie" ? "movie" : "tv";
  const id = `${m.type}-${imdbId}`;
  const poster = m.poster ?? `${METAHUB_POSTER}/${imdbId}/img`;
  const posterHd = m.poster
    ? m.poster.replace("/small/", "/large/")
    : `${METAHUB_POSTER_HD}/${imdbId}/img`;
  const backdrop = m.background ?? `${METAHUB_BG}/${imdbId}/img`;
  const genres = (m.genres ?? m.genre ?? []).filter(Boolean);

  return {
    key: itemKey("cinemeta", id),
    id,
    source: "cinemeta",
    section: sectionOverride ?? inferSectionFromMeta(m),
    title: m.name,
    poster,
    posterHd,
    backdrop,
    year: parseYear(m.releaseInfo ?? m.year),
    rating: parseRating(m.imdbRating),
    genres,
    description: m.description ?? "",
    language: m.language ?? m.country ?? null,
    status: m.status ?? null,
    runtime: parseRuntime(m.runtime),
    popularity: m.popularity ?? null,
    mediaType,
    imdbId,
    tmdbId: m.moviedb_id != null ? String(m.moviedb_id) : null,
  };
}

async function fetchJson<T>(url: string, timeoutMs = 6000): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Catalog request failed (${res.status})`);
  return (await res.json()) as T;
}

export async function fetchCinemetaCatalog(
  type: "movie" | "series",
  catalogId: "top" | "year" | "imdbRating",
  extra?: { genre?: string; search?: string; skip?: number },
): Promise<CinemetaMeta[]> {
  const parts: string[] = [];
  if (extra?.genre) parts.push(`genre=${encodeURIComponent(extra.genre)}`);
  if (extra?.search) parts.push(`search=${encodeURIComponent(extra.search)}`);
  if (extra?.skip && extra.skip > 0) parts.push(`skip=${extra.skip}`);
  const suffix = parts.length ? `/${parts.join("&")}` : "";
  const url = `${CINEMETA_ORIGIN}/catalog/${type}/${catalogId}${suffix}.json`;
  const json = await fetchJson<{ metas?: CinemetaMeta[] }>(url);
  return json.metas ?? [];
}

export async function fetchCinemetaMeta(
  type: "movie" | "series",
  imdbId: string,
): Promise<CinemetaMeta | null> {
  if (!IMDB_ID_RE.test(imdbId)) return null;
  try {
    const json = await fetchJson<{ meta?: CinemetaMeta | null }>(
      `${CINEMETA_ORIGIN}/meta/${type}/${imdbId}.json`,
      5500,
    );
    return json.meta ?? null;
  } catch {
    return null;
  }
}

export function parseCinemetaId(
  rawId: string,
): { type: "movie" | "series"; imdbId: string } | null {
  const prefixed = /^(movie|series)-(tt\d{5,10})$/.exec(rawId);
  if (prefixed) {
    return { type: prefixed[1] as "movie" | "series", imdbId: prefixed[2]! };
  }
  if (IMDB_ID_RE.test(rawId)) {
    return { type: "movie", imdbId: rawId };
  }
  return null;
}

function franchiseRootTitle(title: string): string {
  const cleaned = title
    .replace(/:\s+.*$/, "")
    .replace(/\s+[-–—]\s+.*$/, "")
    .replace(
      /\s+(?:Part|Vol\.?|Chapter|Season)\s+(?:\d+|I{1,3}|IV|V|VI|One|Two|Three|Four)\b.*$/i,
      "",
    )
    .replace(/\s+(?:\d+|II|III|IV|V)$/i, "")
    .trim();
  return cleaned.length >= 3 ? cleaned : title.trim();
}

function normalizeMatchText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function findFranchiseRelations(base: MediaItem): Promise<MediaDetail["relations"]> {
  const root = franchiseRootTitle(base.title);
  if (root.length < 3) return [];
  const normRoot = normalizeMatchText(root);
  if (normRoot.length < 3) return [];

  try {
    const candidates = await Promise.race([
      searchCinemeta(root),
      new Promise<MediaItem[]>((resolve) => setTimeout(() => resolve([]), 3000)),
    ]);
    const currentYear = new Date().getFullYear();
    const seen = new Set<string>([base.id]);
    const matched = candidates
      .filter((item) => {
        if (seen.has(item.id) || item.imdbId === base.imdbId) return false;
        const normTitle = normalizeMatchText(item.title);
        if (!normTitle) return false;
        const isPrefix = normTitle.startsWith(normRoot);
        const isContained = normRoot.length >= 6 && normTitle.includes(normRoot);
        if (!isPrefix && !isContained) return false;
        seen.add(item.id);
        return true;
      })
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));

    return matched.slice(0, 10).map((item) => {
      const isFuture = Boolean(item.year && item.year > currentYear);
      const isSequel = Boolean(item.year && base.year && item.year > base.year);
      const isPrequel = Boolean(item.year && base.year && item.year < base.year);
      const relationType = isFuture
        ? item.mediaType === "tv"
          ? "Upcoming Series"
          : "Upcoming Sequel"
        : isSequel
          ? item.mediaType === "tv"
            ? "Sequel Series"
            : "Sequel"
          : isPrequel
            ? "Earlier Release"
            : item.mediaType === "tv"
              ? "Series"
              : "Movie";
      return {
        id: item.id,
        source: "cinemeta" as const,
        section: item.section,
        mediaType: item.mediaType ?? "movie",
        title: item.title,
        relationType,
        status: isFuture ? "upcoming" : (item.status ?? null),
        format: item.mediaType === "tv" ? "TV" : "MOVIE",
        year: item.year ?? null,
        episodesCount: item.episodesCount ?? null,
        poster: item.poster,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchCinemetaDetail(
  rawId: string,
  sectionOverride?: SectionId,
): Promise<MediaDetail> {
  const parsed = parseCinemetaId(rawId);
  if (!parsed) throw new Error("Invalid media identifier");

  let meta = await fetchCinemetaMeta(parsed.type, parsed.imdbId);
  if (!meta) {
    const altType = parsed.type === "movie" ? "series" : "movie";
    meta = await fetchCinemetaMeta(altType, parsed.imdbId);
  }
  if (!meta) throw new Error("Title details are unavailable right now.");

  const base = mapCinemetaItem(meta, sectionOverride);
  if (!base) throw new Error("Title metadata is incomplete.");

  const relationsPromise = findFranchiseRelations(base);

  let episodes: Episode[] = [];
  let seasons: number[] = [];

  if (meta.type === "series" && (meta.videos?.length ?? 0) > 0) {
    const validVideos = (meta.videos ?? []).filter((v) => {
      const epNum = v.episode ?? v.number ?? 0;
      return epNum > 0;
    });

    const allSeasons = [...new Set(validVideos.map((v) => v.season))].sort((a, b) => a - b);
    const nonZero = allSeasons.filter((s) => s > 0);
    seasons = nonZero.length > 0 ? nonZero : allSeasons;

    const sortedVideos = [...validVideos].sort(
      (a, b) => a.season - b.season || (a.episode ?? a.number ?? 0) - (b.episode ?? b.number ?? 0),
    );

    episodes = sortedVideos
      .filter((v) => (nonZero.length > 0 ? v.season > 0 : true))
      .map((v) => {
        const epNum = v.episode ?? v.number ?? 1;
        const epTitle = v.name || v.title || `Episode ${epNum}`;
        return {
          id: v.id || `${parsed.imdbId}:${v.season}:${epNum}`,
          number: epNum,
          season: v.season,
          title: `S${v.season}·E${epNum} — ${epTitle}`,
          thumbnail: v.thumbnail ?? base.backdrop ?? null,
          description: v.overview ?? v.description ?? null,
          runtime: base.runtime ?? null,
        };
      });
  }

  if (!episodes.length) {
    episodes = [
      {
        id: `${parsed.imdbId}:1`,
        number: 1,
        season: meta.type === "series" ? 1 : null,
        title: meta.type === "movie" ? "Full Movie" : "Episode 1",
        thumbnail: base.backdrop ?? null,
        runtime: base.runtime ?? null,
      },
    ];
    if (meta.type === "series") seasons = [1];
  }

  const relations = await relationsPromise;

  return {
    ...base,
    episodesCount: episodes.length,
    episodes,
    ...(seasons.length ? { seasons } : {}),
    ...(relations?.length ? { relations } : {}),
    cast: (meta.cast ?? []).slice(0, 14).map((name) => ({
      name,
      role: null,
      image: null,
    })),
  };
}

export async function searchCinemeta(query: string): Promise<MediaItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const [movies, series] = await Promise.all([
    fetchCinemetaCatalog("movie", "top", { search: q }).catch(() => [] as CinemetaMeta[]),
    fetchCinemetaCatalog("series", "top", { search: q }).catch(() => [] as CinemetaMeta[]),
  ]);
  const out: MediaItem[] = [];
  const max = Math.max(movies.length, series.length);
  for (let i = 0; i < max; i++) {
    const m = movies[i];
    if (m) {
      const mapped = mapCinemetaItem(m);
      if (mapped) out.push(mapped);
    }
    const s = series[i];
    if (s) {
      const mapped = mapCinemetaItem(s);
      if (mapped) out.push(mapped);
    }
  }
  return out;
}
