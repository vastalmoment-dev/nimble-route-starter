import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  fetchCinemetaCatalog,
  fetchCinemetaMeta,
  mapCinemetaItem,
  type CinemetaMeta,
} from "./cinemeta";
import { loadFallbackCatalog } from "./fallback";
import { buildShelves, dedupe, interleave, pickFeatured } from "./shelves";
import type { MediaItem, SectionCatalog, SectionId } from "./types";

const NON_ANIME_SECTIONS = ["k-dramas", "hollywood", "bollywood", "tollywood", "cartoons"] as const;
type NonAnimeSection = (typeof NON_ANIME_SECTIONS)[number];

interface CuratedEntry {
  type: "movie" | "series";
  imdbId: string;
}

const PINNED_CARTOONS: CuratedEntry[] = [
  // The Bad Guys franchise
  { type: "movie", imdbId: "tt8115900" }, // The Bad Guys (2022)
  { type: "movie", imdbId: "tt30017619" }, // The Bad Guys 2 (2025)
  { type: "movie", imdbId: "tt33130902" }, // The Bad Guys: Haunted Heist (2024)
  { type: "movie", imdbId: "tt28863512" }, // The Bad Guys: A Very Bad Holiday (2023)
  // The Boss Baby franchise (movies + full episode series)
  { type: "movie", imdbId: "tt3874544" }, // The Boss Baby (2017)
  { type: "movie", imdbId: "tt6932874" }, // The Boss Baby: Family Business (2021)
  { type: "series", imdbId: "tt7741824" }, // The Boss Baby: Back in Business (all seasons)
  { type: "series", imdbId: "tt19361940" }, // The Boss Baby: Back in the Crib (all seasons)
  // Teenage Mutant Ninja Turtles franchise (series + movies)
  { type: "series", imdbId: "tt1877889" }, // TMNT (2012)
  { type: "series", imdbId: "tt0131613" }, // TMNT (1987)
  { type: "series", imdbId: "tt0318913" }, // TMNT (2003)
  { type: "series", imdbId: "tt28521741" }, // Tales of the TMNT (2024)
  { type: "series", imdbId: "tt6601082" }, // Rise of the TMNT (2018)
  { type: "movie", imdbId: "tt8589698" }, // TMNT: Mutant Mayhem (2023)
  { type: "movie", imdbId: "tt1291150" }, // TMNT (2014)
  { type: "movie", imdbId: "tt0100758" }, // TMNT (1990)
];

const EXTRA_CARTOONS: CuratedEntry[] = [
  { type: "movie", imdbId: "tt9362722" }, // Spider-Man: Across the Spider-Verse
  { type: "movie", imdbId: "tt4633694" }, // Spider-Man: Into the Spider-Verse
  { type: "movie", imdbId: "tt22022452" }, // Inside Out 2
  { type: "movie", imdbId: "tt29623480" }, // The Wild Robot
  { type: "movie", imdbId: "tt7510222" }, // Despicable Me 4
  { type: "movie", imdbId: "tt13622970" }, // Moana 2
  { type: "movie", imdbId: "tt21692408" }, // Kung Fu Panda 4
  { type: "series", imdbId: "tt0417299" }, // Avatar: The Last Airbender
  { type: "series", imdbId: "tt11126994" }, // Arcane
  { type: "series", imdbId: "tt6741278" }, // Invincible
  { type: "series", imdbId: "tt1865718" }, // Gravity Falls
  { type: "series", imdbId: "tt7678620" }, // Bluey
  { type: "series", imdbId: "tt2861424" }, // Rick and Morty
  { type: "series", imdbId: "tt0206512" }, // SpongeBob SquarePants
];

const CURATED_BOLLYWOOD: CuratedEntry[] = [
  { type: "movie", imdbId: "tt15354916" }, // Jawan
  { type: "movie", imdbId: "tt12844910" }, // Pathaan
  { type: "movie", imdbId: "tt13751694" }, // Animal
  { type: "movie", imdbId: "tt27510174" }, // Stree 2
  { type: "movie", imdbId: "tt27922706" }, // Chhaava
  { type: "movie", imdbId: "tt26233598" }, // Bhool Bhulaiyaa 3
  { type: "movie", imdbId: "tt1187043" }, // 3 Idiots
  { type: "movie", imdbId: "tt5074352" }, // Dangal
  { type: "movie", imdbId: "tt2338151" }, // PK
  { type: "movie", imdbId: "tt4430212" }, // Drishyam
  { type: "movie", imdbId: "tt3863552" }, // Bajrangi Bhaijaan
  { type: "movie", imdbId: "tt1562872" }, // Zindagi Na Milegi Dobara
  { type: "series", imdbId: "tt6077448" }, // Sacred Games
  { type: "series", imdbId: "tt6473300" }, // Mirzapur
  { type: "series", imdbId: "tt12004706" }, // Panchayat
  { type: "series", imdbId: "tt9544034" }, // The Family Man
  { type: "series", imdbId: "tt15477488" }, // Farzi
];

const CURATED_TOLLYWOOD: CuratedEntry[] = [
  { type: "movie", imdbId: "tt8178634" }, // RRR
  { type: "movie", imdbId: "tt16539454" }, // Pushpa 2: The Rule
  { type: "movie", imdbId: "tt9389998" }, // Pushpa: The Rise
  { type: "movie", imdbId: "tt12735488" }, // Kalki 2898 AD
  { type: "movie", imdbId: "tt13927994" }, // Salaar: Part 1
  { type: "movie", imdbId: "tt11821912" }, // Devara: Part 1
  { type: "movie", imdbId: "tt2631186" }, // Baahubali: The Beginning
  { type: "movie", imdbId: "tt4849438" }, // Baahubali 2: The Conclusion
  { type: "movie", imdbId: "tt15433956" }, // Hanu-Man
  { type: "movie", imdbId: "tt2258337" }, // Eega
  { type: "movie", imdbId: "tt1447500" }, // Magadheera
  { type: "movie", imdbId: "tt6792200" }, // Rangasthalam
  { type: "movie", imdbId: "tt10378506" }, // Ala Vaikunthapurramuloo
  { type: "movie", imdbId: "tt29439114" }, // Hi Nanna
  { type: "movie", imdbId: "tt20850406" }, // Sita Ramam
  { type: "movie", imdbId: "tt23865918" }, // Peddi
];

const CURATED_KDRAMAS: CuratedEntry[] = [
  { type: "series", imdbId: "tt10919420" }, // Squid Game
  { type: "series", imdbId: "tt14169960" }, // All of Us Are Dead
  { type: "series", imdbId: "tt6611916" }, // Kingdom
  { type: "series", imdbId: "tt11612120" }, // Sweet Home
  { type: "series", imdbId: "tt21344706" }, // The Glory
  { type: "series", imdbId: "tt27668559" }, // Queen of Tears
  { type: "series", imdbId: "tt10850932" }, // Crash Landing on You
  { type: "series", imdbId: "tt5994364" }, // Goblin
  { type: "series", imdbId: "tt13433812" }, // Vincenzo
  { type: "series", imdbId: "tt24640580" }, // Moving
  { type: "series", imdbId: "tt20234598" }, // Weak Hero Class 1
  { type: "series", imdbId: "tt12940504" }, // My Name
  { type: "series", imdbId: "tt14819828" }, // Business Proposal
  { type: "series", imdbId: "tt20843416" }, // Extraordinary Attorney Woo
  { type: "movie", imdbId: "tt5700672" }, // Train to Busan
];

const CACHE_TTL_MS = 1000 * 60 * 15;
const sectionCache = new Map<NonAnimeSection, { ts: number; catalog: SectionCatalog }>();
const inflight = new Map<NonAnimeSection, Promise<SectionCatalog>>();

async function hydrateEntries(
  entries: CuratedEntry[],
  section: SectionId,
  limit = 24,
): Promise<MediaItem[]> {
  const unique: CuratedEntry[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.imdbId)) continue;
    seen.add(e.imdbId);
    unique.push(e);
    if (unique.length >= limit) break;
  }

  const settled = await Promise.allSettled(
    unique.map(async (e, idx) => {
      const meta = await fetchCinemetaMeta(e.type, e.imdbId);
      if (!meta) return null;
      const item = mapCinemetaItem(meta, section);
      if (!item) return null;
      return {
        ...item,
        popularity: item.popularity ?? 10_000 - idx * 50,
      };
    }),
  );

  const items: MediaItem[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) items.push(r.value);
  }
  return items;
}

async function fetchWikidataImdbReleases(
  kind: "bollywood" | "tollywood" | "k-dramas",
): Promise<CuratedEntry[]> {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 2;
  const sparql =
    kind === "bollywood"
      ? `SELECT DISTINCT ?imdb ?date WHERE { ?item wdt:P31 wd:Q11424; wdt:P364 wd:Q1568; wdt:P345 ?imdb; wdt:P577 ?date. FILTER(YEAR(?date) >= ${minYear} && YEAR(?date) <= ${currentYear + 1}) } ORDER BY DESC(?date) LIMIT 18`
      : kind === "tollywood"
        ? `SELECT DISTINCT ?imdb ?date WHERE { ?item wdt:P31 wd:Q11424; wdt:P364 wd:Q8097; wdt:P345 ?imdb; wdt:P577 ?date. FILTER(YEAR(?date) >= ${minYear - 1} && YEAR(?date) <= ${currentYear + 1}) } ORDER BY DESC(?date) LIMIT 18`
        : `SELECT DISTINCT ?imdb ?date WHERE { ?item wdt:P31 wd:Q5398426; wdt:P495 wd:Q884; wdt:P345 ?imdb; wdt:P580 ?date. FILTER(YEAR(?date) >= ${minYear} && YEAR(?date) <= ${currentYear + 1}) } ORDER BY DESC(?date) LIMIT 18`;

  try {
    const res = await fetch(
      `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
      {
        headers: {
          "User-Agent": "ShadowStreamingCatalog/1.0 (https://shadow.app)",
          Accept: "application/sparql-results+json",
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      results?: { bindings?: { imdb?: { value?: string } }[] };
    };
    const type: "movie" | "series" = kind === "k-dramas" ? "series" : "movie";
    const out: CuratedEntry[] = [];
    for (const b of json.results?.bindings ?? []) {
      const imdb = b.imdb?.value;
      if (imdb && /^tt\d{5,10}$/.test(imdb)) out.push({ type, imdbId: imdb });
    }
    return out;
  } catch {
    return [];
  }
}

function mapMetas(
  metas: CinemetaMeta[],
  section: SectionId,
  opts?: { filter?: (m: CinemetaMeta) => boolean },
): MediaItem[] {
  const out: MediaItem[] = [];
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i]!;
    if (opts?.filter && !opts.filter(m)) continue;
    const item = mapCinemetaItem(m, section);
    if (item) {
      out.push({
        ...item,
        popularity: item.popularity ?? 5000 - i * 20,
      });
    }
  }
  return out;
}

function isJapaneseAnimeMeta(m: CinemetaMeta): boolean {
  const country = (m.country ?? "").toLowerCase();
  return (
    country === "japan" && !/ninja turtles|boss baby|bad guys|spider-man|transformers/i.test(m.name)
  );
}

function isAnimationMeta(m: CinemetaMeta): boolean {
  const genres = (m.genres ?? m.genre ?? []).map((g) => g.toLowerCase());
  return genres.includes("animation") && !isJapaneseAnimeMeta(m);
}

function isEnglishOrGlobalHollywood(m: CinemetaMeta): boolean {
  const genres = (m.genres ?? m.genre ?? []).map((g) => g.toLowerCase());
  if (genres.includes("animation") && isJapaneseAnimeMeta(m)) return false;
  const country = (m.country ?? "").toLowerCase();
  if (country === "south korea" || country === "india" || country === "japan") return false;
  return true;
}

async function buildCartoonsCatalog(): Promise<SectionCatalog> {
  const [pinned, extra, animMovies, animSeries, yearMovies, yearSeries] = await Promise.all([
    hydrateEntries(PINNED_CARTOONS, "cartoons", 20),
    hydrateEntries(EXTRA_CARTOONS, "cartoons", 16),
    fetchCinemetaCatalog("movie", "top", { genre: "Animation" }).catch(() => [] as CinemetaMeta[]),
    fetchCinemetaCatalog("series", "top", { genre: "Animation" }).catch(() => [] as CinemetaMeta[]),
    fetchCinemetaCatalog("movie", "year").catch(() => [] as CinemetaMeta[]),
    fetchCinemetaCatalog("series", "year").catch(() => [] as CinemetaMeta[]),
  ]);

  const newAnimMovies = mapMetas(yearMovies, "cartoons", { filter: isAnimationMeta });
  const newAnimSeries = mapMetas(yearSeries, "cartoons", { filter: isAnimationMeta });
  const topAnimMovies = mapMetas(animMovies, "cartoons", {
    filter: (m) => !isJapaneseAnimeMeta(m),
  });
  const topAnimSeries = mapMetas(animSeries, "cartoons", {
    filter: (m) => !isJapaneseAnimeMeta(m),
  });

  const newReleases = interleave(
    newAnimMovies,
    newAnimSeries,
    pinned.filter((i) => (i.year ?? 0) >= 2023),
  );
  const moviesAll = dedupe([
    ...pinned.filter((i) => i.mediaType === "movie"),
    ...extra.filter((i) => i.mediaType === "movie"),
    ...newAnimMovies,
    ...topAnimMovies,
  ]);
  const seriesAll = dedupe([
    ...pinned.filter((i) => i.mediaType === "tv"),
    ...extra.filter((i) => i.mediaType === "tv"),
    ...newAnimSeries,
    ...topAnimSeries,
  ]);

  const items = dedupe([...pinned, ...newReleases, ...extra, ...topAnimMovies, ...topAnimSeries]);
  const genreShelves = buildShelves(items, "Cartoons").filter((s) => s.id !== "trending");

  const shelves = [
    {
      id: "featured-favorites",
      title: "Bad Guys, Boss Baby & TMNT",
      items: pinned.slice(0, 24),
    },
    ...(newReleases.length
      ? [{ id: "new-releases", title: "New Cartoon Releases", items: newReleases.slice(0, 24) }]
      : []),
    {
      id: "trending",
      title: "Popular Cartoons",
      items: interleave(extra, topAnimMovies, topAnimSeries).slice(0, 24),
    },
    ...(moviesAll.length
      ? [{ id: "cartoon-movies", title: "Animated Movies", items: moviesAll.slice(0, 24) }]
      : []),
    ...(seriesAll.length
      ? [{ id: "cartoon-series", title: "Full Cartoon Series", items: seriesAll.slice(0, 24) }]
      : []),
    ...genreShelves,
  ].filter((s) => s.items.length >= 2);

  return {
    section: "cartoons",
    featured: pickFeatured(pinned, 6),
    shelves,
    items,
    provider: "SHADOW Live Catalog",
  };
}

async function buildHollywoodCatalog(): Promise<SectionCatalog> {
  const [newMoviesRaw, newSeriesRaw, topMoviesRaw, topSeriesRaw, ratedMoviesRaw] =
    await Promise.all([
      fetchCinemetaCatalog("movie", "year").catch(() => [] as CinemetaMeta[]),
      fetchCinemetaCatalog("series", "year").catch(() => [] as CinemetaMeta[]),
      fetchCinemetaCatalog("movie", "top").catch(() => [] as CinemetaMeta[]),
      fetchCinemetaCatalog("series", "top").catch(() => [] as CinemetaMeta[]),
      fetchCinemetaCatalog("movie", "imdbRating").catch(() => [] as CinemetaMeta[]),
    ]);

  const newMovies = mapMetas(newMoviesRaw, "hollywood", { filter: isEnglishOrGlobalHollywood });
  const newSeries = mapMetas(newSeriesRaw, "hollywood", { filter: isEnglishOrGlobalHollywood });
  const topMovies = mapMetas(topMoviesRaw, "hollywood", { filter: isEnglishOrGlobalHollywood });
  const topSeries = mapMetas(topSeriesRaw, "hollywood", { filter: isEnglishOrGlobalHollywood });
  const ratedMovies = mapMetas(ratedMoviesRaw, "hollywood", { filter: isEnglishOrGlobalHollywood });

  const newReleases = interleave(newMovies, newSeries);
  const trending = interleave(topMovies, topSeries);
  const items = dedupe([...newReleases, ...trending, ...ratedMovies]);
  const genreShelves = buildShelves(items, "Hollywood").filter((s) => s.id !== "trending");

  const shelves = [
    ...(newReleases.length
      ? [
          {
            id: "new-releases",
            title: "New Movies & Series Just Out",
            items: newReleases.slice(0, 24),
          },
        ]
      : []),
    { id: "trending", title: "Trending in Hollywood", items: trending.slice(0, 24) },
    ...(topMovies.length
      ? [
          {
            id: "hollywood-movies",
            title: "Hollywood Movies",
            items: dedupe([...newMovies, ...topMovies]).slice(0, 24),
          },
        ]
      : []),
    ...(topSeries.length
      ? [
          {
            id: "hollywood-series",
            title: "Hollywood Series",
            items: dedupe([...newSeries, ...topSeries]).slice(0, 24),
          },
        ]
      : []),
    ...genreShelves,
  ].filter((s) => s.items.length >= 3);

  return {
    section: "hollywood",
    featured: pickFeatured([...topMovies, ...newMovies, ...topSeries], 6),
    shelves,
    items,
    provider: "SHADOW Live Catalog",
  };
}

async function buildIndianOrKoreanCatalog(
  section: "bollywood" | "tollywood" | "k-dramas",
): Promise<SectionCatalog> {
  const curated =
    section === "bollywood"
      ? CURATED_BOLLYWOOD
      : section === "tollywood"
        ? CURATED_TOLLYWOOD
        : CURATED_KDRAMAS;

  const [liveEntries, curatedItems, fallback] = await Promise.all([
    fetchWikidataImdbReleases(section),
    hydrateEntries(curated, section, 20),
    section === "k-dramas"
      ? loadFallbackCatalog()
          .then((c) => c["k-dramas"] ?? [])
          .catch(() => [] as MediaItem[])
      : Promise.resolve([] as MediaItem[]),
  ]);

  const curatedIds = new Set(curated.map((c) => c.imdbId));
  const freshEntries = liveEntries.filter((e) => !curatedIds.has(e.imdbId));
  const freshItems = freshEntries.length ? await hydrateEntries(freshEntries, section, 14) : [];

  const items = dedupe([...freshItems, ...curatedItems, ...fallback]);
  const label =
    section === "bollywood" ? "Bollywood" : section === "tollywood" ? "Tollywood" : "K-Dramas";
  const movies = items.filter((i) => i.mediaType === "movie");
  const series = items.filter((i) => i.mediaType !== "movie");
  const newReleases = dedupe([
    ...freshItems,
    ...items.filter((i) => (i.year ?? 0) >= new Date().getFullYear() - 2),
  ]);

  const genreShelves = buildShelves(items, label).filter((s) => s.id !== "trending");
  const shelves = [
    ...(newReleases.length >= 3
      ? [{ id: "new-releases", title: `New in ${label}`, items: newReleases.slice(0, 24) }]
      : []),
    { id: "trending", title: `Trending in ${label}`, items: items.slice(0, 24) },
    ...(movies.length >= 3
      ? [{ id: `${section}-movies`, title: `${label} Movies`, items: movies.slice(0, 24) }]
      : []),
    ...(series.length >= 3
      ? [{ id: `${section}-series`, title: `${label} Series`, items: series.slice(0, 24) }]
      : []),
    ...genreShelves,
  ].filter((s) => s.items.length >= 3);

  return {
    section,
    featured: pickFeatured([...curatedItems, ...freshItems, ...items], 6),
    shelves,
    items,
    provider: "SHADOW Live Catalog",
  };
}

async function computeSectionCatalog(section: NonAnimeSection): Promise<SectionCatalog> {
  switch (section) {
    case "cartoons":
      return buildCartoonsCatalog();
    case "hollywood":
      return buildHollywoodCatalog();
    case "bollywood":
    case "tollywood":
    case "k-dramas":
      return buildIndianOrKoreanCatalog(section);
  }
}

export const getLiveSectionCatalog = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ section: z.enum(NON_ANIME_SECTIONS) }).parse(input))
  .handler(async ({ data }): Promise<SectionCatalog> => {
    const cached = sectionCache.get(data.section);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS && cached.catalog.items.length > 0) {
      return cached.catalog;
    }
    const existingFlight = inflight.get(data.section);
    if (existingFlight) return existingFlight;

    const promise = computeSectionCatalog(data.section)
      .then((catalog) => {
        if (catalog.items.length > 0) {
          sectionCache.set(data.section, { ts: Date.now(), catalog });
        }
        return catalog;
      })
      .finally(() => {
        inflight.delete(data.section);
      });

    inflight.set(data.section, promise);
    return promise;
  });
