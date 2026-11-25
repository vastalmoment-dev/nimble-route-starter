import { itemKey, stripHtml, type MediaDetail, type MediaItem } from "./types";

const ENDPOINT = "https://graphql.anilist.co";

const MEDIA_FIELDS = `
  id
  idMal
  isAdult
  title { english romaji }
  coverImage { extraLarge large medium }
  bannerImage
  seasonYear
  averageScore
  popularity
  genres
  description(asHtml: false)
  episodes
  nextAiringEpisode { episode airingAt }
  duration
  status
  format
`;

interface AniMedia {
  id: number;
  idMal: number | null;
  isAdult?: boolean | null;
  title: { english: string | null; romaji: string | null };
  coverImage: { extraLarge: string | null; large: string | null; medium?: string | null };
  bannerImage: string | null;
  seasonYear: number | null;
  averageScore: number | null;
  popularity: number | null;
  genres: string[];
  description: string | null;
  episodes: number | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  duration: number | null;
  status: string | null;
  format: string | null;
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AniList request failed (${res.status})`);
  const json = (await res.json()) as { data: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "AniList error");
  return json.data;
}

export function mapAniMedia(m: AniMedia, overrideLatestEp?: number): MediaItem {
  const poster = m.coverImage.large ?? m.coverImage.extraLarge ?? m.coverImage.medium ?? null;
  const posterHd = m.coverImage.extraLarge ?? m.coverImage.large ?? m.coverImage.medium ?? null;
  const airedEpisodes = m.nextAiringEpisode?.episode
    ? Math.max(1, m.nextAiringEpisode.episode - 1)
    : m.episodes;
  return {
    key: itemKey("anilist", String(m.id)),
    id: String(m.id),
    source: "anilist",
    section: "anime",
    title: m.title.english || m.title.romaji || "Untitled",
    malId: m.idMal,
    englishTitle: m.title.english,
    romajiTitle: m.title.romaji,
    poster,
    posterHd,
    backdrop: m.bannerImage,
    year: m.seasonYear,
    rating: m.averageScore != null ? m.averageScore / 10 : null,
    genres: m.genres ?? [],
    description: stripHtml(m.description),
    language: "Japanese",
    status: m.status ? m.status.replace(/_/g, " ").toLowerCase() : null,
    runtime: m.duration,
    episodesCount: airedEpisodes ?? m.episodes,
    latestEpisode: overrideLatestEp ?? airedEpisodes ?? null,
    popularity: m.popularity,
    mediaType: m.format === "MOVIE" ? "movie" : "tv",
  };
}

const shelfQuery = (alias: string, args: string) =>
  `${alias}: Page(perPage: 25) { media(type: ANIME, isAdult: false, ${args}) { ${MEDIA_FIELDS} } }`;

/** One round-trip for live releasing episodes + every anime shelf. */
export async function fetchAnimeShelves() {
  const nowSec = Math.floor(Date.now() / 1000);
  const query = `query {
    latest: Page(perPage: 40) {
      airingSchedules(airingAt_lesser: ${nowSec}, sort: TIME_DESC) {
        episode
        airingAt
        media { ${MEDIA_FIELDS} }
      }
    }
    ${shelfQuery("airing", "status: RELEASING, sort: START_DATE_DESC")}
    ${shelfQuery("trending", "sort: TRENDING_DESC")}
    ${shelfQuery("popular", "sort: POPULARITY_DESC")}
    ${shelfQuery("action", 'sort: POPULARITY_DESC, genre: "Action"')}
    ${shelfQuery("horror", 'sort: POPULARITY_DESC, genre: "Horror"')}
    ${shelfQuery("scifi", 'sort: POPULARITY_DESC, genre: "Sci-Fi"')}
    ${shelfQuery("drama", 'sort: POPULARITY_DESC, genre: "Drama"')}
    ${shelfQuery("comedy", 'sort: POPULARITY_DESC, genre: "Comedy"')}
    ${shelfQuery("top", "sort: SCORE_DESC")}
  }`;
  type R = {
    latest: {
      airingSchedules: {
        episode: number;
        airingAt: number;
        media: AniMedia | null;
      }[];
    };
  } & Record<
    "airing" | "trending" | "popular" | "action" | "horror" | "scifi" | "drama" | "comedy" | "top",
    { media: AniMedia[] }
  >;

  const data = await gql<R>(query);
  const map = (k: Exclude<keyof R, "latest">) => data[k].media.map((m) => mapAniMedia(m));

  const seenLatest = new Set<number>();
  const latest: MediaItem[] = [];
  for (const entry of data.latest.airingSchedules) {
    const m = entry.media;
    if (!m || m.isAdult || seenLatest.has(m.id)) continue;
    seenLatest.add(m.id);
    latest.push(mapAniMedia(m, entry.episode));
  }

  return {
    latest,
    airing: map("airing"),
    trending: map("trending"),
    popular: map("popular"),
    action: map("action"),
    horror: map("horror"),
    scifi: map("scifi"),
    drama: map("drama"),
    comedy: map("comedy"),
    top: map("top"),
  };
}

export type AnimeBrowseSort =
  "POPULARITY_DESC" | "TRENDING_DESC" | "START_DATE_DESC" | "SCORE_DESC" | "TITLE_ROMAJI";

export interface AnimeBrowsePage {
  items: MediaItem[];
  hasNextPage: boolean;
  currentPage: number;
  total: number;
}

export async function fetchAllAnimePage({
  page = 1,
  perPage = 36,
  sort = "POPULARITY_DESC",
  search,
}: {
  page?: number;
  perPage?: number;
  sort?: AnimeBrowseSort;
  search?: string;
}): Promise<AnimeBrowsePage> {
  const q = search?.trim();
  const data = await gql<{
    Page: {
      pageInfo: { hasNextPage: boolean; currentPage: number; total: number };
      media: AniMedia[];
    };
  }>(
    `query ($page: Int, $perPage: Int, $sort: [MediaSort], $search: String) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage currentPage total }
        media(type: ANIME, isAdult: false, sort: $sort, search: $search) {
          ${MEDIA_FIELDS}
        }
      }
    }`,
    {
      page,
      perPage,
      sort: q ? ["SEARCH_MATCH", sort] : [sort],
      ...(q ? { search: q } : {}),
    },
  );
  return {
    items: data.Page.media.map((m) => mapAniMedia(m)),
    hasNextPage: data.Page.pageInfo.hasNextPage,
    currentPage: data.Page.pageInfo.currentPage,
    total: data.Page.pageInfo.total,
  };
}

export async function searchAnime(search: string): Promise<MediaItem[]> {
  const data = await gql<{ Page: { media: AniMedia[] } }>(
    `query ($search: String) { Page(perPage: 36) { media(type: ANIME, isAdult: false, search: $search, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} } } }`,
    { search },
  );
  return data.Page.media.map((m) => mapAniMedia(m));
}

export async function fetchAnimeDetail(id: string): Promise<MediaDetail> {
  type R = {
    Media: AniMedia & {
      streamingEpisodes: { title: string | null; thumbnail: string | null }[];
      externalLinks: { site: string; url: string; type: string | null }[] | null;
      characters: {
        edges: {
          role: string;
          node: { name: { full: string }; image: { medium: string | null } };
        }[];
      };
    };
  };
  const data = await gql<R>(
    `query ($id: Int) { Media(id: $id, type: ANIME) {
      ${MEDIA_FIELDS}
      streamingEpisodes { title thumbnail }
      externalLinks { site url type }
      characters(perPage: 12, sort: [ROLE, RELEVANCE]) { edges { role node { name { full } image { medium } } } }
    } }`,
    { id: Number(id) },
  );
  const m = data.Media;
  const base = mapAniMedia(m);
  const streaming = m.streamingEpisodes ?? [];
  const airedFromSchedule = m.nextAiringEpisode?.episode
    ? Math.max(1, m.nextAiringEpisode.episode - 1)
    : 0;
  const total =
    Math.max(
      m.episodes ?? 0,
      airedFromSchedule,
      streaming.length,
      base.mediaType === "movie" ? 1 : 0,
    ) || 12;

  const episodes = Array.from({ length: Math.min(total, 5000) }, (_, i) => {
    const se = streaming.find(
      (s) => s.title && new RegExp(`^Episode ${i + 1}\\b`, "i").test(s.title),
    );
    const title = se?.title?.replace(/^Episode \d+\s*-\s*/i, "") || `Episode ${i + 1}`;
    return {
      id: `${id}-${i + 1}`,
      number: i + 1,
      season: 1,
      title,
      thumbnail: se?.thumbnail ?? null,
      runtime: m.duration,
    };
  });
  return {
    ...base,
    episodesCount: episodes.length,
    episodes,
    watchLinks: (m.externalLinks ?? [])
      .filter((l) => l.type === "STREAMING")
      .map((l) => ({ site: l.site, url: l.url })),
    cast: m.characters.edges.map((e) => ({
      name: e.node.name.full,
      role: e.role.toLowerCase(),
      image: e.node.image.medium,
    })),
  };
}
