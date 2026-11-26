import { cachedAsync } from "@/lib/cache/client-cache";
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
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(8000),
      });
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 450));
        continue;
      }
      if (!res.ok) throw new Error(`AniList request failed (${res.status})`);
      const json = (await res.json()) as { data: T; errors?: { message: string }[] };
      if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "AniList error");
      return json.data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }
  }
  throw lastError ?? new Error("AniList request failed");
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
  return cachedAsync("anilist:shelves", 1000 * 60 * 5, async () => {
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
      | "airing"
      | "trending"
      | "popular"
      | "action"
      | "horror"
      | "scifi"
      | "drama"
      | "comedy"
      | "top",
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
  });
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
  const q = search?.trim() ?? "";
  return cachedAsync(
    `anilist:page:${sort}:${page}:${perPage}:${q.toLowerCase()}`,
    1000 * 60 * 5,
    async () => {
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
    },
  );
}

export async function searchAnime(search: string): Promise<MediaItem[]> {
  const data = await gql<{ Page: { media: AniMedia[] } }>(
    `query ($search: String) { Page(perPage: 36) { media(type: ANIME, isAdult: false, search: $search, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} } } }`,
    { search },
  );
  return data.Page.media.map((m) => mapAniMedia(m));
}

interface AniRelationNode {
  id: number;
  idMal: number | null;
  isAdult?: boolean | null;
  type: string;
  title: { english: string | null; romaji: string | null };
  format: string | null;
  episodes: number | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  status: string | null;
  seasonYear: number | null;
  coverImage: { large: string | null; medium?: string | null };
}

interface AniRelationEdge {
  relationType: string;
  node: AniRelationNode | null;
}

const SEASON_FORMATS = new Set(["TV", "TV_SHORT", "ONA", "OVA", "MOVIE", "SPECIAL"]);
const SEASON_RELATIONS = new Set([
  "PREQUEL",
  "SEQUEL",
  "PARENT",
  "SIDE_STORY",
  "ALTERNATIVE",
  "SPIN_OFF",
]);

function relationLabel(raw: string, format: string | null, status: string | null): string {
  if (status === "NOT_YET_RELEASED") {
    return format === "MOVIE" ? "Upcoming Movie" : "Upcoming Season";
  }
  if (format === "MOVIE") return "Movie";
  if (format === "OVA" || format === "SPECIAL") return format;
  return raw.replace(/_/g, " ").toLowerCase();
}

async function collectSeasonRelations(
  rootId: number,
  initialEdges: AniRelationEdge[],
): Promise<MediaDetail["relations"]> {
  const seen = new Map<number, { node: AniRelationNode; relationType: string }>();
  const frontier: number[] = [];

  const recordEdge = (edge: AniRelationEdge) => {
    const node = edge.node;
    if (!node || node.type !== "ANIME" || node.isAdult) return;
    if (node.format && !SEASON_FORMATS.has(node.format)) return;
    if (!SEASON_RELATIONS.has(edge.relationType)) return;
    if (!seen.has(node.id)) {
      seen.set(node.id, { node, relationType: edge.relationType });
      if ((edge.relationType === "PREQUEL" || edge.relationType === "SEQUEL") && seen.size < 18) {
        frontier.push(node.id);
      }
    }
  };

  for (const edge of initialEdges) recordEdge(edge);

  // Follow up to 4 hops along prequel/sequel chain in parallel batches so multi-season franchises appear completely.
  const visited = new Set<number>([rootId]);
  for (let hop = 0; hop < 4 && frontier.length > 0 && seen.size < 18; hop++) {
    const batch = frontier.splice(0, 4).filter((nid) => !visited.has(nid));
    if (!batch.length) break;
    batch.forEach((nid) => visited.add(nid));
    try {
      const data = await gql<{
        Page: {
          media: {
            id: number;
            relations: { edges: AniRelationEdge[] };
          }[];
        };
      }>(
        `query ($ids: [Int]) {
          Page(perPage: 10) {
            media(id_in: $ids, type: ANIME) {
              id
              relations {
                edges {
                  relationType(version: 2)
                  node {
                    id idMal isAdult type
                    title { english romaji }
                    format episodes
                    nextAiringEpisode { episode airingAt }
                    status seasonYear
                    coverImage { large medium }
                  }
                }
              }
            }
          }
        }`,
        { ids: batch },
      );
      for (const item of data.Page.media) {
        for (const edge of item.relations.edges) recordEdge(edge);
      }
    } catch {
      break;
    }
  }

  return [...seen.values()]
    .filter(({ node }) => node.id !== rootId)
    .sort(
      (a, b) => (a.node.seasonYear ?? 9999) - (b.node.seasonYear ?? 9999) || a.node.id - b.node.id,
    )
    .map(({ node, relationType }) => {
      const epCount = node.nextAiringEpisode?.episode
        ? Math.max(1, node.nextAiringEpisode.episode - 1)
        : node.episodes;
      return {
        id: String(node.id),
        source: "anilist" as const,
        section: "anime" as const,
        mediaType: node.format === "MOVIE" ? ("movie" as const) : ("tv" as const),
        title: node.title.english || node.title.romaji || "Untitled",
        relationType: relationLabel(relationType, node.format, node.status),
        status: node.status ? node.status.replace(/_/g, " ").toLowerCase() : null,
        format: node.format,
        year: node.seasonYear,
        episodesCount: epCount,
        poster: node.coverImage.large ?? node.coverImage.medium ?? null,
      };
    });
}

export async function fetchAnimeDetail(id: string): Promise<MediaDetail> {
  return cachedAsync(`anilist:detail:${id}`, 1000 * 60 * 10, async () => {
    type R = {
      Media: AniMedia & {
        streamingEpisodes: { title: string | null; thumbnail: string | null }[];
        externalLinks: { site: string; url: string; type: string | null }[] | null;
        relations: { edges: AniRelationEdge[] };
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
        relations {
          edges {
            relationType(version: 2)
            node {
              id idMal isAdult type
              title { english romaji }
              format episodes
              nextAiringEpisode { episode airingAt }
              status seasonYear
              coverImage { large medium }
            }
          }
        }
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

    const relations = await collectSeasonRelations(m.id, m.relations?.edges ?? []);

    return {
      ...base,
      episodesCount: episodes.length,
      episodes,
      ...(relations?.length ? { relations } : {}),
      watchLinks: (m.externalLinks ?? [])
        .filter((l) => l.type === "STREAMING")
        .map((l) => ({ site: l.site, url: l.url })),
      cast: m.characters.edges.map((e) => ({
        name: e.node.name.full,
        role: e.role.toLowerCase(),
        image: e.node.image.medium,
      })),
    };
  });
}
