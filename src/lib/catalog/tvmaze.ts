import { cachedAsync } from "@/lib/cache/client-cache";
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
  externals?: { imdb?: string | null; thetvdb?: number | null } | null;
  network: { name: string; country?: { code: string } | null } | null;
  webChannel: { name: string; country?: { code: string } | null } | null;
  image: { medium: string; original: string } | null;
  summary: string | null;
}

const INDIAN = ["Hindi", "Telugu", "Tamil", "Malayalam", "Kannada", "Bengali", "Marathi"];

export function sectionForShow(
  show: Pick<TvmShow, "type" | "language" | "network" | "webChannel">,
): SectionId {
  const country = show.network?.country?.code ?? show.webChannel?.country?.code ?? "";
  if (show.language === "Japanese" && show.type === "Animation") return "anime";
  if (show.type === "Animation") return "cartoons";
  if (show.language === "Korean" || country === "KR") return "k-dramas";
  if (country === "NG" || show.language === "Yoruba" || show.language === "Igbo")
    return "nollywood";
  if (show.language === "Telugu") return "tollywood";
  if (show.language && INDIAN.includes(show.language)) return "bollywood";
  return "hollywood";
}

export function mapShow(s: TvmShow, latestEpisode?: number | null): MediaItem {
  const imdbId =
    s.externals?.imdb && /^tt\d{5,10}$/.test(s.externals.imdb) ? s.externals.imdb : null;
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
    ...(imdbId ? { imdbId } : {}),
    ...(latestEpisode != null && latestEpisode > 0 ? { latestEpisode } : {}),
  };
}

async function get<T>(path: string): Promise<T> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
  try {
    const res = await fetch(`${API}${path}`, {
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) throw new Error(`TVmaze request failed (${res.status})`);
    return (await res.json()) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface TvmScheduleEntry {
  number?: number | null;
  show?: TvmShow | null;
  _embedded?: { show?: TvmShow | null } | null;
}

const EXCLUDED_SHOW_TYPES = new Set([
  "talk show",
  "news",
  "sports",
  "game show",
  "award show",
  "variety",
  "reality",
]);

export async function fetchLiveAiringShows(
  lang: "en" | "fr" = "en",
): Promise<Record<SectionId, MediaItem[]>> {
  return cachedAsync(
    `tvmaze:airing:${lang}`,
    1000 * 60 * 10,
    async () => {
      const buckets: Record<SectionId, MediaItem[]> = {
        anime: [],
        "k-dramas": [],
        hollywood: [],
        bollywood: [],
        tollywood: [],
        nollywood: [],
        cartoons: [],
      };
      const paths = [
        "/schedule",
        "/schedule/web",
        "/schedule?country=KR",
        "/schedule?country=IN",
        ...(lang === "fr" ? ["/schedule?country=FR"] : []),
      ];
      const settled = await Promise.allSettled(
        paths.map((p) => get<TvmScheduleEntry[]>(p).catch(() => [] as TvmScheduleEntry[])),
      );
      const seenShowIds = new Set<number>();
      for (const res of settled) {
        if (res.status !== "fulfilled" || !Array.isArray(res.value)) continue;
        for (const entry of res.value) {
          const show = entry.show ?? entry._embedded?.show;
          if (!show || !show.id || seenShowIds.has(show.id)) continue;
          if (!show.image?.medium) continue;
          const showType = (show.type ?? "").toLowerCase();
          if (EXCLUDED_SHOW_TYPES.has(showType)) continue;
          const mapped = mapShow(show, entry.number ?? null);
          if (mapped.section === "anime") continue;
          seenShowIds.add(show.id);
          buckets[mapped.section].push(mapped);
        }
      }
      for (const sec of Object.keys(buckets) as SectionId[]) {
        buckets[sec].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
      }
      return buckets;
    },
    { persist: "session" },
  );
}

export async function searchShows(q: string): Promise<MediaItem[]> {
  return cachedAsync(
    `tvmaze:search:${q.trim().toLowerCase()}`,
    1000 * 60 * 15,
    async () => {
      const rows = await get<{ show: TvmShow }[]>(`/search/shows?q=${encodeURIComponent(q)}`);
      return rows.map((r) => mapShow(r.show)).filter((i) => i.poster);
    },
    { persist: "session" },
  );
}

export async function fetchShowDetail(id: string): Promise<MediaDetail> {
  return cachedAsync(
    `tvmaze:detail:${id}`,
    1000 * 60 * 15,
    async () => {
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
        .sort(
          (a, b) => (b.resolutions.original.width ?? 0) - (a.resolutions.original.width ?? 0),
        )[0];
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
    },
    { persist: "session" },
  );
}
