import { queryOptions } from "@tanstack/react-query";
import { cachedAsync } from "@/lib/cache/client-cache";
import type { SiteLanguage } from "@/lib/i18n/language";
import { fetchAnimeDetail, fetchAnimeShelves, searchAnime } from "./anilist";
import { fetchCinemetaDetail, searchCinemeta } from "./cinemeta";
import { loadAnimeFallbackCatalog, loadFallbackCatalog } from "./fallback";
import { getLiveSectionCatalog, searchMediaCatalog } from "./media.functions";
import { buildShelves, dedupe, interleave, pickFeatured } from "./shelves";
import { getTmdbDetail, getTmdbSection } from "./tmdb.functions";
import { fetchShowDetail, searchShows } from "./tvmaze";
import {
  SECTION_META,
  type MediaDetail,
  type MediaItem,
  type SectionCatalog,
  type SectionId,
  type Source,
} from "./types";

type NonAnime = Exclude<SectionId, "anime">;

async function loadAnime(): Promise<SectionCatalog> {
  try {
    const s = await fetchAnimeShelves();
    const shelves = [
      ...(s.latest.length
        ? [{ id: "latest", title: "New Episodes Just Out", items: s.latest }]
        : []),
      ...(s.airing.length
        ? [{ id: "airing", title: "New & Airing This Season", items: s.airing }]
        : []),
      { id: "trending", title: "Trending Anime", items: s.trending },
      { id: "popular", title: "All-Time Popular", items: s.popular },
      { id: "action", title: "Action Blockbusters", items: s.action },
      { id: "horror", title: "Zombie & Horror", items: s.horror },
      { id: "scifi", title: "Sci-Fi Epics", items: s.scifi },
      { id: "drama", title: "Heartfelt Drama", items: s.drama },
      { id: "comedy", title: "Laugh Out Loud", items: s.comedy },
      { id: "top", title: "Top Rated", items: s.top },
    ].filter((sh) => sh.items.length > 0);
    const items = dedupe(shelves.flatMap((sh) => sh.items));
    if (items.length > 0) {
      return {
        section: "anime",
        featured: pickFeatured(s.trending.length ? s.trending : items, 6),
        shelves,
        items,
        provider: "SHADOW Live Catalog",
      };
    }
  } catch {
    // Fall through to bundled anime fallback seeds if AniList is rate-limited/unreachable.
  }
  const fallbackItems = loadAnimeFallbackCatalog();
  return {
    section: "anime",
    featured: pickFeatured(fallbackItems, 6),
    shelves: buildShelves(fallbackItems, "Anime"),
    items: fallbackItems,
    provider: "SHADOW Live Catalog",
  };
}

async function loadNonAnime(section: NonAnime, lang: SiteLanguage = "en"): Promise<SectionCatalog> {
  try {
    const live = await getLiveSectionCatalog({ data: { section, lang } });
    if (live.items.length) return live;
  } catch {
    // Fall through to TMDB / bundled fallback if server catalog call fails.
  }

  let items: MediaItem[] = [];
  try {
    const tmdb = await getTmdbSection({ data: { section } });
    if (tmdb.enabled && tmdb.items.length) {
      items = dedupe(tmdb.items);
    }
  } catch {
    // Server function unavailable — fall through to the bundled catalog.
  }
  if (!items.length) items = (await loadFallbackCatalog())[section] ?? [];
  const label = SECTION_META[section].label.split(" /")[0] ?? SECTION_META[section].label;
  return {
    section,
    featured: pickFeatured(items, 6),
    shelves: buildShelves(items, label),
    items,
    provider: "SHADOW Live Catalog",
  };
}

const SECTION_CACHE_TTL_MS = 1000 * 60 * 8;
const HOME_CACHE_TTL_MS = 1000 * 60 * 5;
const DETAIL_CACHE_TTL_MS = 1000 * 60 * 10;
const SEARCH_CACHE_TTL_MS = 1000 * 60 * 3;

export function loadSection(
  section: SectionId,
  lang: SiteLanguage = "en",
): Promise<SectionCatalog> {
  const key = section === "anime" ? "catalog:section:anime" : `catalog:section:${section}:${lang}`;
  const ttl = section === "anime" ? HOME_CACHE_TTL_MS : SECTION_CACHE_TTL_MS;
  return cachedAsync(key, ttl, () =>
    section === "anime" ? loadAnime() : loadNonAnime(section, lang),
  );
}

const settle = <T>(p: Promise<T>) =>
  p.then(
    (v) => v,
    () => null,
  );

export async function loadHome(lang: SiteLanguage = "en"): Promise<SectionCatalog> {
  return cachedAsync(`catalog:home:${lang}`, HOME_CACHE_TTL_MS, async () => {
    const ids: SectionId[] = [
      "anime",
      "k-dramas",
      "hollywood",
      "bollywood",
      "tollywood",
      "nollywood",
      "cartoons",
    ];
    const results = (await Promise.all(ids.map((id) => settle(loadSection(id, lang))))).filter(
      (r): r is SectionCatalog => r !== null,
    );
    if (!results.length) throw new Error("No catalog source is reachable right now.");
    const shelf = (id: string) =>
      results.map((r) => r.shelves.find((s) => s.id === id)?.items ?? []);
    const shelves = [
      ...(lang === "fr"
        ? [
            {
              id: "french-selection",
              title: "Cinéma & Animation en Français",
              items: interleave(...shelf("french-selection")).slice(0, 30),
            },
          ]
        : []),
      {
        id: "new-releases",
        title: "New Movies & Episodes Just Out",
        items: interleave(...shelf("new-releases"), ...shelf("latest")).slice(0, 30),
      },
      {
        id: "trending",
        title: "Trending Now",
        items: interleave(...shelf("trending")).slice(0, 30),
      },
      {
        id: "hollywood-movies",
        title: lang === "fr" ? "Films Populaires" : "Popular English Movies",
        items: interleave(...shelf("hollywood-movies"), ...shelf("cartoon-movies")).slice(0, 30),
      },
      {
        id: "action",
        title: "Action Blockbusters",
        items: interleave(...shelf("action")).slice(0, 30),
      },
      {
        id: "horror",
        title: "Zombie & Horror",
        items: interleave(...shelf("horror")).slice(0, 30),
      },
      { id: "scifi", title: "Sci-Fi Epics", items: interleave(...shelf("scifi")).slice(0, 30) },
      { id: "top", title: "Top Rated", items: interleave(...shelf("top")).slice(0, 30) },
      ...results.map((r) => ({
        id: `section-${r.section}`,
        title: `Spotlight: ${SECTION_META[r.section as SectionId].label}`,
        items: r.shelves[0]?.items ?? [],
      })),
    ].filter((s) => s.items.length);
    const featured = interleave(...results.map((r) => r.featured.slice(0, 2))).slice(0, 7);
    return {
      section: "home",
      featured,
      shelves,
      items: dedupe(results.flatMap((r) => r.items)),
      provider: "SHADOW Live Catalog",
    };
  });
}

export async function loadDetail(source: Source, id: string): Promise<MediaDetail> {
  return cachedAsync(`catalog:detail:${source}:${id}`, DETAIL_CACHE_TTL_MS, async () => {
    if (source === "anilist") return fetchAnimeDetail(id);
    if (source === "cinemeta") return fetchCinemetaDetail(id);
    if (source === "tvmaze") return fetchShowDetail(id);
    const detail = await getTmdbDetail({ data: { id } });
    if (!detail) throw new Error("This title is unavailable right now.");
    return detail;
  });
}

export async function searchAll(q: string): Promise<MediaItem[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  return cachedAsync(`catalog:search:${term.toLowerCase()}`, SEARCH_CACHE_TTL_MS, async () => {
    const [anime, serverMedia, cinemetaClient, shows] = await Promise.all([
      settle(searchAnime(term)),
      settle(searchMediaCatalog({ data: { q: term } })),
      settle(searchCinemeta(term)),
      settle(searchShows(term)),
    ]);
    return interleave(anime ?? [], serverMedia ?? [], cinemetaClient ?? [], shows ?? []);
  });
}

const STALE = 1000 * 60 * 10;
const ANIME_STALE = 1000 * 60 * 3;

export const sectionQuery = (section: SectionId | "home", lang: SiteLanguage = "en") =>
  queryOptions({
    queryKey: ["section", section, section === "anime" ? "all" : lang],
    queryFn: () => (section === "home" ? loadHome(lang) : loadSection(section, lang)),
    staleTime: section === "anime" ? ANIME_STALE : STALE,
  });

export const detailQuery = (source: Source, id: string) =>
  queryOptions({
    queryKey: ["detail", source, id],
    queryFn: () => loadDetail(source, id),
    staleTime: STALE,
  });

export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["search", q.trim()],
    queryFn: () => searchAll(q),
    staleTime: STALE,
    enabled: q.trim().length >= 2,
  });

export * from "./types";
export * from "./genres";
