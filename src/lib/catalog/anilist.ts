import { itemKey, stripHtml, type MediaDetail, type MediaItem } from "./types";

const ENDPOINT = "https://graphql.anilist.co";

const MEDIA_FIELDS = `
  id
  title { english romaji }
  coverImage { extraLarge large }
  bannerImage
  seasonYear
  averageScore
  popularity
  genres
  description(asHtml: false)
  episodes
  duration
  status
  format
`;

interface AniMedia {
  id: number;
  title: { english: string | null; romaji: string | null };
  coverImage: { extraLarge: string | null; large: string | null };
  bannerImage: string | null;
  seasonYear: number | null;
  averageScore: number | null;
  popularity: number | null;
  genres: string[];
  description: string | null;
  episodes: number | null;
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

export function mapAniMedia(m: AniMedia): MediaItem {
  return {
    key: itemKey("anilist", String(m.id)),
    id: String(m.id),
    source: "anilist",
    section: "anime",
    title: m.title.english || m.title.romaji || "Untitled",
    poster: m.coverImage.large ?? m.coverImage.extraLarge,
    posterHd: m.coverImage.extraLarge ?? m.coverImage.large,
    backdrop: m.bannerImage,
    year: m.seasonYear,
    rating: m.averageScore != null ? m.averageScore / 10 : null,
    genres: m.genres ?? [],
    description: stripHtml(m.description),
    language: "Japanese",
    status: m.status ? m.status.replace(/_/g, " ").toLowerCase() : null,
    runtime: m.duration,
    episodesCount: m.episodes,
    popularity: m.popularity,
    mediaType: m.format === "MOVIE" ? "movie" : "tv",
  };
}

const shelfQuery = (alias: string, args: string) =>
  `${alias}: Page(perPage: 20) { media(type: ANIME, isAdult: false, ${args}) { ${MEDIA_FIELDS} } }`;

/** One round-trip for every anime shelf. */
export async function fetchAnimeShelves() {
  const query = `query {
    ${shelfQuery("trending", "sort: TRENDING_DESC")}
    ${shelfQuery("action", 'sort: POPULARITY_DESC, genre: "Action"')}
    ${shelfQuery("horror", 'sort: POPULARITY_DESC, genre: "Horror"')}
    ${shelfQuery("scifi", 'sort: POPULARITY_DESC, genre: "Sci-Fi"')}
    ${shelfQuery("drama", 'sort: POPULARITY_DESC, genre: "Drama"')}
    ${shelfQuery("comedy", 'sort: POPULARITY_DESC, genre: "Comedy"')}
    ${shelfQuery("top", "sort: SCORE_DESC")}
  }`;
  type R = Record<"trending" | "action" | "horror" | "scifi" | "drama" | "comedy" | "top", { media: AniMedia[] }>;
  const data = await gql<R>(query);
  const map = (k: keyof R) => data[k].media.map(mapAniMedia);
  return {
    trending: map("trending"),
    action: map("action"),
    horror: map("horror"),
    scifi: map("scifi"),
    drama: map("drama"),
    comedy: map("comedy"),
    top: map("top"),
  };
}

export async function searchAnime(search: string): Promise<MediaItem[]> {
  const data = await gql<{ Page: { media: AniMedia[] } }>(
    `query ($search: String) { Page(perPage: 24) { media(type: ANIME, isAdult: false, search: $search, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} } } }`,
    { search },
  );
  return data.Page.media.map(mapAniMedia);
}

export async function fetchAnimeDetail(id: string): Promise<MediaDetail> {
  type R = {
    Media: AniMedia & {
      streamingEpisodes: { title: string | null; thumbnail: string | null }[];
      externalLinks: { site: string; url: string; type: string | null }[] | null;
      characters: {
        edges: { role: string; node: { name: { full: string }; image: { medium: string | null } } }[];
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
  const total = Math.max(m.episodes ?? 0, streaming.length, base.mediaType === "movie" ? 1 : 0) || 12;
  const episodes = Array.from({ length: Math.min(total, 200) }, (_, i) => {
    const se = streaming.find((s) => s.title && new RegExp(`^Episode ${i + 1}\\b`, "i").test(s.title));
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
    episodes,
    watchLinks: (m.externalLinks ?? []).filter((l) => l.type === "STREAMING").map((l) => ({ site: l.site, url: l.url })),
    cast: m.characters.edges.map((e) => ({
      name: e.node.name.full,
      role: e.role.toLowerCase(),
      image: e.node.image.medium,
    })),
  };
}
