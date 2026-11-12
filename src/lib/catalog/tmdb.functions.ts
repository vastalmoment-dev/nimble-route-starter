import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { itemKey, type MediaDetail, type MediaItem } from "./types";

/**
 * TMDB integration. Runs on the server so the TMDB_API_KEY secret never reaches the browser.
 * When the secret is absent, functions return { enabled: false } and the app falls back to the
 * bundled structured JSON catalog.
 */

const TMDB_SECTIONS = ["k-dramas", "hollywood", "bollywood", "cartoons"] as const;
type TmdbSection = (typeof TMDB_SECTIONS)[number];

const GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary",
  18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science-Fiction", 10770: "TV Movie", 53: "Thriller",
  10752: "War", 37: "Western", 10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};

const DISCOVER: Record<TmdbSection, { type: "tv" | "movie"; params: string }[]> = {
  "k-dramas": [{ type: "tv", params: "with_original_language=ko&without_genres=16,10764,10767" }],
  hollywood: [
    { type: "movie", params: "with_original_language=en&region=US" },
    { type: "tv", params: "with_original_language=en&with_origin_country=US&without_genres=16,10764,10767" },
  ],
  bollywood: [
    { type: "movie", params: "with_original_language=hi" },
    { type: "movie", params: "with_original_language=te" },
  ],
  cartoons: [{ type: "tv", params: "with_genres=16&with_original_language=en" }],
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

function tmdbFetch(path: string, key: string) {
  const isBearer = key.startsWith("eyJ");
  const url = `https://api.themoviedb.org/3${path}${path.includes("?") ? "&" : "?"}${isBearer ? "" : `api_key=${key}`}`;
  return fetch(url, {
    headers: isBearer ? { Authorization: `Bearer ${key}`, Accept: "application/json" } : { Accept: "application/json" },
  });
}

function mapRow(r: TmdbRow, type: "tv" | "movie", section: TmdbSection): MediaItem {
  const id = `${type}-${r.id}`;
  const date = r.release_date || r.first_air_date;
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
    genres: r.genres?.map((g) => g.name) ?? (r.genre_ids ?? []).map((g) => GENRES[g] ?? "").filter(Boolean),
    description: r.overview,
    language: r.original_language,
    popularity: r.popularity,
    mediaType: type,
  };
}

export const getTmdbSection = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ section: z.enum(TMDB_SECTIONS) }).parse(input))
  .handler(async ({ data }) => {
    const key = process.env["TMDB_API_KEY"];
    if (!key) return { enabled: false as const, items: [] as MediaItem[] };
    try {
      const requests = DISCOVER[data.section].flatMap((d) =>
        [1, 2].map(async (page) => {
          const res = await tmdbFetch(`/discover/${d.type}?sort_by=popularity.desc&include_adult=false&page=${page}&${d.params}`, key);
          if (!res.ok) throw new Error(`TMDB ${res.status}`);
          const json = (await res.json()) as { results: TmdbRow[] };
          return json.results.filter((r) => r.poster_path).map((r) => mapRow(r, d.type, data.section));
        }),
      );
      const items = (await Promise.all(requests)).flat();
      return { enabled: true as const, items };
    } catch (error) {
      console.error("TMDB section failed", error);
      return { enabled: false as const, items: [] as MediaItem[] };
    }
  });

export const getTmdbDetail = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ id: z.string().regex(/^(tv|movie)-\d+$/) }).parse(input))
  .handler(async ({ data }): Promise<MediaDetail | null> => {
    const key = process.env["TMDB_API_KEY"];
    if (!key) return null;
    const [type, rawId] = data.id.split("-") as ["tv" | "movie", string];
    try {
      const res = await tmdbFetch(`/${type}/${rawId}?append_to_response=credits`, key);
      if (!res.ok) return null;
      const r = (await res.json()) as TmdbRow & {
        runtime?: number;
        episode_run_time?: number[];
        status?: string;
        networks?: { name: string }[];
        number_of_episodes?: number;
        seasons?: { season_number: number; episode_count: number }[];
        credits?: { cast: { name: string; character: string; profile_path: string | null }[] };
      };
      const lang = r.original_language;
      const section: TmdbSection =
        r.genres?.some((g) => g.id === 16) ? "cartoons" : lang === "ko" ? "k-dramas" : ["hi", "te", "ta", "ml", "kn"].includes(lang) ? "bollywood" : "hollywood";
      const base = mapRow(r, type, section);
      let episodes: MediaDetail["episodes"] = [];
      if (type === "tv") {
        const seasonNo = r.seasons?.find((s) => s.season_number > 0)?.season_number ?? 1;
        const sRes = await tmdbFetch(`/tv/${rawId}/season/${seasonNo}`, key);
        if (sRes.ok) {
          const season = (await sRes.json()) as {
            episodes: { id: number; episode_number: number; name: string; still_path: string | null; overview: string; runtime: number | null }[];
          };
          episodes = season.episodes.map((e) => ({
            id: String(e.id),
            number: e.episode_number,
            season: seasonNo,
            title: `S${seasonNo}·E${e.episode_number} — ${e.name}`,
            thumbnail: e.still_path ? `${IMG}/w300${e.still_path}` : null,
            description: e.overview,
            runtime: e.runtime,
          }));
        }
      } else {
        episodes = [{ id: data.id, number: 1, season: null, title: "Feature film", thumbnail: base.backdrop ?? null, runtime: r.runtime ?? null }];
      }
      return {
        ...base,
        runtime: r.runtime ?? r.episode_run_time?.[0] ?? null,
        status: r.status ?? null,
        network: r.networks?.[0]?.name ?? null,
        episodesCount: r.number_of_episodes ?? null,
        episodes,
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
  });
