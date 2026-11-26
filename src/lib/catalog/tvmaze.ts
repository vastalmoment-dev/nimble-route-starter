import { itemKey, stripHtml, type MediaDetail, type MediaItem, type SectionId } from "./types";

const API = "https://api.tvmaze.com";

interface TvmShow {
  id: number;
  name: string;
  type: string;
  language: string | null;
  genres: string[];
  status: string | null;
  premiered: string | null;
  runtime: number | null;
  rating: { average: number | null };
  weight: number | null;
  network: { name: string; country?: { code: string } | null } | null;
  webChannel: { name: string; country?: { code: string } | null } | null;
  image: { medium: string; original: string } | null;
  summary: string | null;
}

const INDIAN = ["Hindi", "Telugu", "Tamil", "Malayalam", "Kannada", "Bengali", "Marathi"];

export function sectionForShow(show: Pick<TvmShow, "type" | "language">): SectionId {
  if (show.language === "Japanese" && show.type === "Animation") return "anime";
  if (show.type === "Animation") return "cartoons";
  if (show.language === "Korean") return "k-dramas";
  if (show.language && INDIAN.includes(show.language)) return "bollywood";
  return "hollywood";
}

export function mapShow(s: TvmShow): MediaItem {
  return {
    key: itemKey("tvmaze", String(s.id)),
    id: String(s.id),
    source: "tvmaze",
    section: sectionForShow(s),
    title: s.name,
    poster: s.image?.medium ?? null,
    posterHd: s.image?.original ?? null,
    year: s.premiered ? Number(s.premiered.slice(0, 4)) : null,
    rating: s.rating?.average ?? null,
    genres: s.genres ?? [],
    description: stripHtml(s.summary),
    language: s.language,
    network: s.network?.name ?? s.webChannel?.name ?? null,
    status: s.status,
    runtime: s.runtime,
    popularity: s.weight,
    mediaType: "tv",
  };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`TVmaze request failed (${res.status})`);
  return (await res.json()) as T;
}

export async function searchShows(q: string): Promise<MediaItem[]> {
  const rows = await get<{ show: TvmShow }[]>(`/search/shows?q=${encodeURIComponent(q)}`);
  return rows.map((r) => mapShow(r.show)).filter((i) => i.poster);
}

export async function fetchShowDetail(id: string): Promise<MediaDetail> {
  type R = TvmShow & {
    externals?: { imdb?: string | null; thetvdb?: number | null } | null;
    _embedded?: {
      cast?: {
        person: { name: string; image: { medium: string } | null };
        character: { name: string };
      }[];
      episodes?: {
        id: number;
        name: string;
        season: number;
        number: number | null;
        runtime: number | null;
        image: { medium: string } | null;
        summary: string | null;
      }[];
      images?: { type: string; resolutions: { original: { url: string; width?: number } } }[];
      seasons?: { number: number }[];
    };
  };
  const s = await get<R>(
    `/shows/${id}?embed[]=cast&embed[]=episodes&embed[]=images&embed[]=seasons`,
  );
  const base = mapShow(s);
  const bg = s._embedded?.images
    ?.filter((i) => i.type === "background")
    .sort((a, b) => (b.resolutions.original.width ?? 0) - (a.resolutions.original.width ?? 0))[0];
  const rawEpisodes = (s._embedded?.episodes ?? [])
    .filter((e) => e.number != null)
    .sort((a, b) => a.season - b.season || (a.number ?? 0) - (b.number ?? 0));
  const seasonSet = new Set<number>(rawEpisodes.map((e) => e.season));
  for (const sn of s._embedded?.seasons ?? []) {
    if (sn.number > 0) seasonSet.add(sn.number);
  }
  const seasons = [...seasonSet].sort((a, b) => a - b);
  const episodes = rawEpisodes.map((e, i) => ({
    id: String(e.id),
    number: e.number ?? i + 1,
    season: e.season,
    title: `S${e.season}·E${e.number} — ${e.name}`,
    thumbnail: e.image?.medium ?? null,
    description: stripHtml(e.summary),
    runtime: e.runtime,
  }));
  const imdbId =
    s.externals?.imdb && /^tt\d{5,10}$/.test(s.externals.imdb) ? s.externals.imdb : null;
  return {
    ...base,
    imdbId,
    backdrop: bg?.resolutions.original.url ?? null,
    episodesCount: episodes.length,
    episodes,
    ...(seasons.length ? { seasons } : {}),
    cast: (s._embedded?.cast ?? []).slice(0, 14).map((c) => ({
      name: c.person.name,
      role: c.character.name,
      image: c.person.image?.medium ?? null,
    })),
  };
}
