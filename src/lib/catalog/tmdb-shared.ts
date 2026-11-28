import { itemKey, type MediaDetail, type MediaItem } from "./types";

export const TMDB_SECTIONS = [
  "k-dramas",
  "hollywood",
  "bollywood",
  "tollywood",
  "nollywood",
  "cartoons",
] as const;
export type TmdbSection = (typeof TMDB_SECTIONS)[number];
export type TmdbLang = "en" | "fr";

const GENRES_EN: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science-Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

const GENRES_FR: Record<number, string> = {
  28: "Action",
  12: "Aventure",
  16: "Animation",
  35: "Comédie",
  80: "Crime",
  99: "Documentaire",
  18: "Drame",
  10751: "Familial",
  14: "Fantastique",
  36: "Histoire",
  27: "Horreur",
  10402: "Musique",
  9648: "Mystère",
  10749: "Romance",
  878: "Science-Fiction",
  10770: "Téléfilm",
  53: "Thriller",
  10752: "Guerre",
  37: "Western",
  10759: "Action & Aventure",
  10762: "Enfants",
  10763: "Actualités",
  10764: "Téléréalité",
  10765: "Science-Fiction & Fantastique",
  10766: "Feuilleton",
  10767: "Talk-show",
  10768: "Guerre & Politique",
};

const DISCOVER: Record<TmdbSection, { type: "tv" | "movie"; params: string }[]> = {
  "k-dramas": [{ type: "tv", params: "with_original_language=ko&without_genres=16,10764,10767" }],
  hollywood: [
    { type: "movie", params: "with_original_language=en&without_genres=16" },
    {
      type: "tv",
      params: "with_original_language=en&with_origin_country=US&without_genres=16,10764,10767",
    },
  ],
  bollywood: [
    { type: "movie", params: "with_original_language=hi" },
    { type: "tv", params: "with_original_language=hi&without_genres=16,10764,10767" },
    { type: "movie", params: "with_original_language=ta" },
  ],
  tollywood: [
    { type: "movie", params: "with_original_language=te" },
    { type: "tv", params: "with_original_language=te&without_genres=16,10764,10767" },
  ],
  nollywood: [
    { type: "movie", params: "with_origin_country=NG" },
    { type: "tv", params: "with_origin_country=NG&without_genres=16,10764,10767" },
  ],
  cartoons: [
    { type: "tv", params: "with_genres=16&with_original_language=en" },
    { type: "movie", params: "with_genres=16&with_original_language=en" },
  ],
};

const IMG = "https://image.tmdb.org/t/p";

interface TmdbRow {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  overview: string;
  original_language: string;
  popularity: number;
}

function tmdbLangParam(lang: TmdbLang): string {
  return lang === "fr" ? "fr-FR" : "en-US";
}

export async function tmdbFetch(path: string, key: string, lang: TmdbLang = "en") {
  const isBearer = key.startsWith("eyJ");
  const sep = path.includes("?") ? "&" : "?";
  const hasLang = /([?&])language=/.test(path);
  const langQuery = hasLang ? "" : `language=${tmdbLangParam(lang)}`;
  const keyQuery = isBearer ? "" : `api_key=${key}`;
  const extras = [langQuery, keyQuery].filter(Boolean).join("&");
  const url = `https://api.themoviedb.org/3${path}${extras ? `${sep}${extras}` : ""}`;

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
  try {
    return await fetch(url, {
      headers: isBearer
        ? { Authorization: `Bearer ${key}`, Accept: "application/json" }
        : { Accept: "application/json" },
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mapRow(
  r: TmdbRow,
  type: "tv" | "movie",
  section: TmdbSection,
  lang: TmdbLang = "en",
): MediaItem {
  const id = `${type}-${r.id}`;
  const date = r.release_date || r.first_air_date;
  const genreTable = lang === "fr" ? GENRES_FR : GENRES_EN;
  return {
    key: itemKey("tmdb", id),
    id,
    source: "tmdb",
    section,
    title: r.title ?? r.name ?? "Untitled",
    poster: r.poster_path ? `${IMG}/w342${r.poster_path}` : null,
    posterHd: r.poster_path ? `${IMG}/w780${r.poster_path}` : null,
    backdrop: r.backdrop_path ? `${IMG}/w1280${r.backdrop_path}` : null,
    year: date ? Number(date.slice(0, 4)) : null,
    rating: r.vote_average || null,
    genres:
      r.genres?.map((g) => g.name) ??
      (r.genre_ids ?? []).map((g) => genreTable[g] ?? "").filter(Boolean),
    description: r.overview,
    language: r.original_language,
    popularity: r.popularity,
    mediaType: type,
  };
}

export async function fetchTmdbSectionWithKey(
  section: TmdbSection,
  lang: TmdbLang,
  key: string,
): Promise<{ enabled: boolean; items: MediaItem[] }> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const requests = DISCOVER[section].flatMap((d) => {
      const dateParam =
        d.type === "tv"
          ? `sort_by=first_air_date.desc&first_air_date.lte=${today}&vote_count.gte=1`
          : `sort_by=primary_release_date.desc&primary_release_date.lte=${today}&vote_count.gte=1`;
      return [
        // Freshly aired / released titles first
        (async () => {
          const res = await tmdbFetch(
            `/discover/${d.type}?${dateParam}&include_adult=false&page=1&${d.params}`,
            key,
            lang,
          );
          if (!res.ok) return [] as MediaItem[];
          const json = (await res.json()) as { results: TmdbRow[] };
          return json.results
            .filter((r) => r.poster_path)
            .map((r) => mapRow(r, d.type, section, lang));
        })(),
        ...[1, 2].map(async (page) => {
          const res = await tmdbFetch(
            `/discover/${d.type}?sort_by=popularity.desc&include_adult=false&page=${page}&${d.params}`,
            key,
            lang,
          );
          if (!res.ok) throw new Error(`TMDB ${res.status}`);
          const json = (await res.json()) as { results: TmdbRow[] };
          return json.results
            .filter((r) => r.poster_path)
            .map((r) => mapRow(r, d.type, section, lang));
        }),
      ];
    });
    const items = (await Promise.all(requests)).flat();
    return { enabled: true, items };
  } catch (error) {
    console.error("TMDB section failed", error);
    return { enabled: false, items: [] };
  }
}

export async function fetchTmdbDetailWithKey(
  id: string,
  lang: TmdbLang,
  key: string,
): Promise<MediaDetail | null> {
  const [type, rawId] = id.split("-") as ["tv" | "movie", string];
  try {
    const res = await tmdbFetch(
      `/${type}/${rawId}?append_to_response=credits,external_ids`,
      key,
      lang,
    );
    if (!res.ok) return null;
    const r = (await res.json()) as TmdbRow & {
      runtime?: number;
      episode_run_time?: number[];
      status?: string;
      origin_country?: string[];
      production_countries?: { iso_3166_1: string }[];
      networks?: { name: string }[];
      number_of_episodes?: number;
      seasons?: { season_number: number; episode_count: number }[];
      belongs_to_collection?: { id: number; name: string } | null;
      external_ids?: { imdb_id?: string | null };
      credits?: { cast: { name: string; character: string; profile_path: string | null }[] };
    };

    if (lang === "fr" && !r.overview?.trim()) {
      try {
        const enRes = await tmdbFetch(`/${type}/${rawId}`, key, "en");
        if (enRes.ok) {
          const enRow = (await enRes.json()) as { overview?: string };
          if (enRow.overview?.trim()) r.overview = enRow.overview;
        }
      } catch {
        /* English overview fallback optional */
      }
    }

    const origLang = r.original_language;
    const isNigeria =
      Boolean(r.origin_country?.includes("NG")) ||
      Boolean(r.production_countries?.some((c) => c.iso_3166_1 === "NG")) ||
      ["yo", "ig", "ha"].includes(origLang);
    const section: TmdbSection = r.genres?.some((g) => g.id === 16)
      ? "cartoons"
      : isNigeria
        ? "nollywood"
        : origLang === "ko"
          ? "k-dramas"
          : origLang === "te"
            ? "tollywood"
            : ["hi", "ta", "ml", "kn"].includes(origLang)
              ? "bollywood"
              : "hollywood";
    const base = mapRow(r, type, section, lang);
    let episodes: MediaDetail["episodes"] = [];
    let seasons: number[] = [];
    let relations: NonNullable<MediaDetail["relations"]> = [];
    if (type === "tv") {
      const validSeasons = (r.seasons ?? [])
        .filter((s) => s.season_number > 0)
        .map((s) => s.season_number)
        .sort((a, b) => a - b);
      seasons = validSeasons.length ? validSeasons : [1];
      const seasonResults = await Promise.all(
        seasons.slice(0, 12).map(async (seasonNo) => {
          const sRes = await tmdbFetch(`/tv/${rawId}/season/${seasonNo}`, key, lang);
          if (!sRes.ok) return [];
          const season = (await sRes.json()) as {
            episodes: {
              id: number;
              episode_number: number;
              name: string;
              still_path: string | null;
              overview: string;
              runtime: number | null;
            }[];
          };
          let enMap: Map<number, { name: string; overview: string }> | null = null;
          if (
            lang === "fr" &&
            season.episodes.some((ep) => !ep.overview?.trim() || !ep.name?.trim())
          ) {
            try {
              const enSeasonRes = await tmdbFetch(`/tv/${rawId}/season/${seasonNo}`, key, "en");
              if (enSeasonRes.ok) {
                const enSeason = (await enSeasonRes.json()) as {
                  episodes: { episode_number: number; name: string; overview: string }[];
                };
                enMap = new Map(
                  enSeason.episodes.map((ep) => [
                    ep.episode_number,
                    { name: ep.name, overview: ep.overview },
                  ]),
                );
              }
            } catch {
              /* English episode fallback optional */
            }
          }
          return [...season.episodes]
            .sort((a, b) => a.episode_number - b.episode_number)
            .map((e) => {
              const enFallback = enMap?.get(e.episode_number);
              const epName = e.name?.trim() || enFallback?.name || `Episode ${e.episode_number}`;
              const epOverview = e.overview?.trim() || enFallback?.overview || "";
              return {
                id: String(e.id),
                number: e.episode_number,
                season: seasonNo,
                title: `S${seasonNo}·E${e.episode_number} — ${epName}`,
                thumbnail: e.still_path ? `${IMG}/w300${e.still_path}` : null,
                description: epOverview,
                runtime: e.runtime,
              };
            });
        }),
      );
      episodes = seasonResults
        .flat()
        .sort((a, b) => (a.season ?? 1) - (b.season ?? 1) || a.number - b.number);
    } else {
      episodes = [
        {
          id,
          number: 1,
          season: null,
          title: lang === "fr" ? "Long métrage" : "Feature film",
          thumbnail: base.backdrop ?? null,
          runtime: r.runtime ?? null,
        },
      ];
      if (r.belongs_to_collection?.id) {
        try {
          const colRes = await tmdbFetch(`/collection/${r.belongs_to_collection.id}`, key, lang);
          if (colRes.ok) {
            const col = (await colRes.json()) as {
              parts?: (TmdbRow & { release_date?: string })[];
            };
            const currentYear = new Date().getFullYear();
            relations = (col.parts ?? [])
              .filter((p) => String(p.id) !== rawId)
              .sort((a, b) => (a.release_date ?? "9999").localeCompare(b.release_date ?? "9999"))
              .map((p) => {
                const yr = p.release_date ? Number(p.release_date.slice(0, 4)) : null;
                const isFuture = Boolean(yr && yr > currentYear);
                const isSequel = Boolean(yr && base.year && yr > base.year);
                const relationType =
                  lang === "fr"
                    ? isFuture
                      ? "Suite à venir"
                      : isSequel
                        ? "Suite"
                        : "Volet"
                    : isFuture
                      ? "Upcoming Sequel"
                      : isSequel
                        ? "Sequel"
                        : "Part";
                return {
                  id: `movie-${p.id}`,
                  source: "tmdb" as const,
                  section,
                  mediaType: "movie" as const,
                  title: p.title ?? p.name ?? "Untitled",
                  relationType,
                  status: isFuture ? "upcoming" : null,
                  format: "MOVIE",
                  year: yr,
                  episodesCount: 1,
                  poster: p.poster_path ? `${IMG}/w342${p.poster_path}` : null,
                };
              });
          }
        } catch {
          /* collection optional */
        }
      }
    }
    return {
      ...base,
      tmdbId: rawId,
      imdbId: r.external_ids?.imdb_id ?? null,
      runtime: r.runtime ?? r.episode_run_time?.[0] ?? null,
      status: r.status ?? null,
      network: r.networks?.[0]?.name ?? null,
      episodesCount: r.number_of_episodes ?? episodes.length,
      episodes,
      ...(seasons.length ? { seasons } : {}),
      ...(relations.length ? { relations } : {}),
      cast: (r.credits?.cast ?? []).slice(0, 14).map((c) => ({
        name: c.name,
        role: c.character,
        image: c.profile_path ? `${IMG}/w185${c.profile_path}` : null,
      })),
    };
  } catch (error) {
    console.error("TMDB detail failed", error);
    return null;
  }
}

type TmdbVideo = { key: string; site: string; type: string; official?: boolean };

export async function fetchTmdbVideosWithKey(
  type: "tv" | "movie",
  id: string,
  key: string,
): Promise<string | null> {
  const res = await tmdbFetch(`/${type}/${id}/videos`, key, "en");
  if (!res.ok) return null;
  const { results } = (await res.json()) as { results: TmdbVideo[] };
  const yt = results.filter((v) => v.site === "YouTube");
  const pick =
    yt.find((v) => v.type === "Trailer" && v.official) ??
    yt.find((v) => v.type === "Trailer") ??
    yt.find((v) => v.type === "Teaser") ??
    yt[0];
  return pick?.key ?? null;
}

export async function searchTmdbTrailerWithKey(title: string, key: string): Promise<string | null> {
  for (const type of ["tv", "movie"] as const) {
    const res = await tmdbFetch(`/search/${type}?query=${encodeURIComponent(title)}`, key, "en");
    if (!res.ok) continue;
    const { results } = (await res.json()) as { results: { id: number }[] };
    const first = results[0];
    if (first) {
      const k = await fetchTmdbVideosWithKey(type, String(first.id), key);
      if (k) return k;
    }
  }
  return null;
}
