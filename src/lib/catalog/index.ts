import { queryOptions } from "@tanstack/react-query";
import { fetchAnimeDetail, fetchAnimeShelves, searchAnime } from "./anilist";
import { loadFallbackCatalog } from "./fallback";
import { buildShelves, dedupe, interleave, pickFeatured } from "./shelves";
import { getTmdbDetail, getTmdbSection } from "./tmdb.functions";
import { fetchShowDetail, searchShows } from "./tvmaze";
import { SECTION_META, type MediaDetail, type MediaItem, type SectionCatalog, type SectionId, type Source } from "./types";

type NonAnime = Exclude<SectionId, "anime">;

async function loadAnime(): Promise<SectionCatalog> {
  const s = await fetchAnimeShelves();
  const shelves = [
    { id: "trending", title: "Trending Anime", items: s.trending },
    { id: "action", title: "Action Blockbusters", items: s.action },
    { id: "horror", title: "Zombie & Horror", items: s.horror },
    { id: "scifi", title: "Sci-Fi Epics", items: s.scifi },
    { id: "drama", title: "Heartfelt Drama", items: s.drama },
    { id: "comedy", title: "Laugh Out Loud", items: s.comedy },
    { id: "top", title: "Top Rated", items: s.top },
  ];
  const items = dedupe(shelves.flatMap((sh) => sh.items));
  return { section: "anime", featured: pickFeatured(s.trending, 6), shelves, items, provider: "AniList" };
}

async function loadNonAnime(section: NonAnime): Promise<SectionCatalog> {
  let items: MediaItem[] = [];
  let provider = "Shadow catalog (TVmaze)";
  try {
    const tmdb = await getTmdbSection({ data: { section } });
    if (tmdb.enabled && tmdb.items.length) {
      items = dedupe(tmdb.items);
      provider = "TMDB";
    }
  } catch {
    // Server function unavailable — fall through to the bundled catalog.
  }
  if (!items.length) items = (await loadFallbackCatalog())[section];
  const label = SECTION_META[section].label.split(" /")[0] ?? SECTION_META[section].label;
  return { section, featured: pickFeatured(items, 6), shelves: buildShelves(items, label), items, provider };
}

export function loadSection(section: SectionId): Promise<SectionCatalog> {
  return section === "anime" ? loadAnime() : loadNonAnime(section);
}

const settle = <T,>(p: Promise<T>) => p.then((v) => v, () => null);

export async function loadHome(): Promise<SectionCatalog> {
  const ids: SectionId[] = ["anime", "k-dramas", "hollywood", "bollywood", "cartoons"];
  const results = (await Promise.all(ids.map((id) => settle(loadSection(id))))).filter(
    (r): r is SectionCatalog => r !== null,
  );
  if (!results.length) throw new Error("No catalog source is reachable right now.");
  const shelf = (id: string) => results.map((r) => r.shelves.find((s) => s.id === id)?.items ?? []);
  const shelves = [
    { id: "trending", title: "Trending Now", items: interleave(...shelf("trending")).slice(0, 30) },
    { id: "action", title: "Action Blockbusters", items: interleave(...shelf("action")).slice(0, 30) },
    { id: "horror", title: "Zombie & Horror", items: interleave(...shelf("horror")).slice(0, 30) },
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
    provider: results.map((r) => r.provider).join(" · "),
  };
}

export async function loadDetail(source: Source, id: string): Promise<MediaDetail> {
  if (source === "anilist") return fetchAnimeDetail(id);
  if (source === "tvmaze") return fetchShowDetail(id);
  const detail = await getTmdbDetail({ data: { id } });
  if (!detail) throw new Error("This title is unavailable right now.");
  return detail;
}

export async function searchAll(q: string): Promise<MediaItem[]> {
  const [anime, shows] = await Promise.all([settle(searchAnime(q)), settle(searchShows(q))]);
  return interleave(anime ?? [], shows ?? []);
}

const STALE = 1000 * 60 * 10;

export const sectionQuery = (section: SectionId | "home") =>
  queryOptions({
    queryKey: ["section", section],
    queryFn: () => (section === "home" ? loadHome() : loadSection(section)),
    staleTime: STALE,
  });

export const detailQuery = (source: Source, id: string) =>
  queryOptions({
    queryKey: ["detail", source, id],
    queryFn: () => loadDetail(source, id),
    staleTime: STALE,
  });

export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["search", q],
    queryFn: () => searchAll(q),
    staleTime: STALE,
    enabled: q.trim().length >= 2,
  });

export * from "./types";
export * from "./genres";
