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

const NON_ANIME_SECTIONS = [
  "k-dramas",
  "hollywood",
  "bollywood",
  "tollywood",
  "nollywood",
  "cartoons",
] as const;
type NonAnimeSection = (typeof NON_ANIME_SECTIONS)[number];
type CatalogLang = "en" | "fr";

interface CuratedEntry {
  type: "movie" | "series";
  imdbId: string;
}

const PINNED_CARTOONS: CuratedEntry[] = [
  // Miraculous franchise (EN & FR)
  { type: "series", imdbId: "tt2580046" }, // Miraculous: Tales of Ladybug & Cat Noir
  { type: "movie", imdbId: "tt10364034" }, // Miraculous: Ladybug & Cat Noir, the Movie (2023)
  { type: "movie", imdbId: "tt29259099" }, // Miraculous World: Paris
  { type: "movie", imdbId: "tt13701202" }, // Miraculous World: London
  // The Bad Guys franchise
  { type: "movie", imdbId: "tt8115900" }, // The Bad Guys (2022)
  { type: "movie", imdbId: "tt30017619" }, // The Bad Guys 2 (2025)
  { type: "movie", imdbId: "tt33130902" }, // The Bad Guys: Haunted Heist (2024)
  { type: "movie", imdbId: "tt28863512" }, // The Bad Guys: A Very Bad Holiday (2023)
  // The Boss Baby franchise (movies + full episode series)
  { type: "movie", imdbId: "tt3874544" }, // The Boss Baby (2017)
  { type: "movie", imdbId: "tt6932874" }, // The Boss Baby: Family Business (2021)
  { type: "series", imdbId: "tt7741824" }, // The Boss Baby: Back in Business
  { type: "series", imdbId: "tt19361940" }, // The Boss Baby: Back in the Crib
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
  { type: "movie", imdbId: "tt4729430" }, // Klaus
  { type: "movie", imdbId: "tt2096673" }, // Inside Out
  { type: "series", imdbId: "tt0417299" }, // Avatar: The Last Airbender
  { type: "series", imdbId: "tt11126994" }, // Arcane
  { type: "series", imdbId: "tt6741278" }, // Invincible
  { type: "series", imdbId: "tt1865718" }, // Gravity Falls
  { type: "series", imdbId: "tt7678620" }, // Bluey
  { type: "series", imdbId: "tt2861424" }, // Rick and Morty
  { type: "series", imdbId: "tt0206512" }, // SpongeBob SquarePants
];

const CURATED_HOLLYWOOD_ENGLISH: CuratedEntry[] = [
  { type: "movie", imdbId: "tt15239678" }, // Dune: Part Two
  { type: "movie", imdbId: "tt6263850" }, // Deadpool & Wolverine
  { type: "movie", imdbId: "tt15398776" }, // Oppenheimer
  { type: "movie", imdbId: "tt18412256" }, // Alien: Romulus
  { type: "movie", imdbId: "tt1684562" }, // The Fall Guy
  { type: "movie", imdbId: "tt9218128" }, // Gladiator II
  { type: "movie", imdbId: "tt0816692" }, // Interstellar
  { type: "movie", imdbId: "tt1375666" }, // Inception
  { type: "movie", imdbId: "tt0468569" }, // The Dark Knight
  { type: "movie", imdbId: "tt1745960" }, // Top Gun: Maverick
  { type: "series", imdbId: "tt0903747" }, // Breaking Bad
  { type: "series", imdbId: "tt3581920" }, // The Last of Us
  { type: "series", imdbId: "tt4574334" }, // Stranger Things
  { type: "series", imdbId: "tt11198330" }, // House of the Dragon
];

const CURATED_FRENCH_MOVIES: CuratedEntry[] = [
  { type: "movie", imdbId: "tt1675434" }, // Intouchables
  { type: "movie", imdbId: "tt17009710" }, // Anatomy of a Fall
  { type: "movie", imdbId: "tt26446278" }, // The Count of Monte Cristo (2024)
  { type: "movie", imdbId: "tt13964390" }, // Under Paris (Sous la Seine)
  { type: "movie", imdbId: "tt0211915" }, // Amélie
  { type: "movie", imdbId: "tt8613070" }, // Portrait of a Lady on Fire
  { type: "movie", imdbId: "tt10199590" }, // Les Misérables
  { type: "movie", imdbId: "tt12672536" }, // The Three Musketeers: D'Artagnan
  { type: "series", imdbId: "tt2531336" }, // Lupin
  { type: "series", imdbId: "tt4277922" }, // Call My Agent!
];

const CURATED_FRENCH_CARTOONS: CuratedEntry[] = [
  { type: "series", imdbId: "tt2580046" }, // Miraculous: Tales of Ladybug & Cat Noir
  { type: "movie", imdbId: "tt10364034" }, // Miraculous: Ladybug & Cat Noir, the Movie
  { type: "movie", imdbId: "tt29259099" }, // Miraculous World: Paris
  { type: "movie", imdbId: "tt13701202" }, // Miraculous World: London
  { type: "series", imdbId: "tt11126994" }, // Arcane
  { type: "series", imdbId: "tt1807824" }, // Wakfu
  { type: "series", imdbId: "tt0417311" }, // Code Lyoko
  { type: "movie", imdbId: "tt26915336" }, // Mars Express
  { type: "movie", imdbId: "tt1816518" }, // Ernest & Celestine
  { type: "movie", imdbId: "tt8001346" }, // Asterix: The Secret of the Magic Potion
  { type: "movie", imdbId: "tt1754656" }, // The Little Prince
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
  { type: "series", imdbId: "tt19868374" }, // Dhootha
  { type: "series", imdbId: "tt15471900" }, // Rana Naidu
  { type: "series", imdbId: "tt27412343" }, // Saving the Tigers
];

const CURATED_NOLLYWOOD: CuratedEntry[] = [
  { type: "movie", imdbId: "tt34573436" }, // Everybody Loves Jenifa
  { type: "movie", imdbId: "tt33255000" }, // Lisabi: The Uprising
  { type: "movie", imdbId: "tt24083908" }, // The Black Book
  { type: "movie", imdbId: "tt28546464" }, // Jagun Jagun
  { type: "movie", imdbId: "tt21432050" }, // Anikulapo
  { type: "movie", imdbId: "tt19704612" }, // Gangs of Lagos
  { type: "movie", imdbId: "tt29769154" }, // A Tribe Called Judah
  { type: "movie", imdbId: "tt19704920" }, // Brotherhood
  { type: "movie", imdbId: "tt23635786" }, // Battle on Buka Street
  { type: "movie", imdbId: "tt21874950" }, // Adire
  { type: "movie", imdbId: "tt25830860" }, // A Sunday Affair
  { type: "movie", imdbId: "tt29193979" }, // Over the Bridge
  { type: "movie", imdbId: "tt29953830" }, // A Green Fever
  { type: "movie", imdbId: "tt8329618" }, // King of Boys
  { type: "movie", imdbId: "tt5978822" }, // The Wedding Party
  { type: "movie", imdbId: "tt11481312" }, // Citation
  { type: "movie", imdbId: "tt9725830" }, // Oloture
  { type: "movie", imdbId: "tt23728818" }, // Ijakumo
  { type: "movie", imdbId: "tt11005162" }, // Elevator Baby
  { type: "movie", imdbId: "tt12539758" }, // Living in Bondage: Breaking Free
  { type: "movie", imdbId: "tt10327136" }, // Mokalik
  { type: "movie", imdbId: "tt9652322" }, // Chief Daddy
  { type: "series", imdbId: "tt19398068" }, // Blood Sisters
  { type: "series", imdbId: "tt22099034" }, // Shanty Town
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
  { type: "series", imdbId: "tt20234568" }, // Weak Hero Class 1
  { type: "series", imdbId: "tt12940504" }, // My Name
  { type: "series", imdbId: "tt14819828" }, // Business Proposal
  { type: "series", imdbId: "tt20869502" }, // Extraordinary Attorney Woo
  { type: "movie", imdbId: "tt5700672" }, // Train to Busan
];

const CACHE_TTL_MS = 1000 * 60 * 15;
const sectionCache = new Map<string, { ts: number; catalog: SectionCatalog }>();
const inflight = new Map<string, Promise<SectionCatalog>>();

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
  kind: "bollywood" | "tollywood" | "nollywood" | "k-dramas" | "french",
): Promise<CuratedEntry[]> {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 2;
  const sparql =
    kind === "bollywood"
      ? `SELECT DISTINCT ?imdb ?date WHERE { ?item wdt:P31 wd:Q11424; wdt:P364 wd:Q1568; wdt:P345 ?imdb; wdt:P577 ?date. FILTER(YEAR(?date) >= ${minYear} && YEAR(?date) <= ${currentYear + 1}) } ORDER BY DESC(?date) LIMIT 18`
      : kind === "tollywood"
        ? `SELECT DISTINCT ?imdb ?date WHERE { ?item wdt:P31 wd:Q11424; wdt:P364 wd:Q8097; wdt:P345 ?imdb; wdt:P577 ?date. FILTER(YEAR(?date) >= ${minYear - 1} && YEAR(?date) <= ${currentYear + 1}) } ORDER BY DESC(?date) LIMIT 18`
        : kind === "nollywood"
          ? `SELECT DISTINCT ?imdb ?date WHERE { ?item wdt:P31 wd:Q11424; wdt:P495 wd:Q1033; wdt:P345 ?imdb; wdt:P577 ?date. FILTER(YEAR(?date) >= ${minYear - 2} && YEAR(?date) <= ${currentYear + 1}) } ORDER BY DESC(?date) LIMIT 24`
          : kind === "french"
            ? `SELECT DISTINCT ?imdb ?date WHERE { ?item wdt:P31 wd:Q11424; wdt:P364 wd:Q150; wdt:P345 ?imdb; wdt:P577 ?date. FILTER(YEAR(?date) >= ${minYear} && YEAR(?date) <= ${currentYear + 1}) } ORDER BY DESC(?date) LIMIT 18`
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

async function buildCartoonsCatalog(lang: CatalogLang): Promise<SectionCatalog> {
  const [pinned, extra, frenchCartoons, animMovies, animSeries, yearMovies, yearSeries, fallback] =
    await Promise.all([
      hydrateEntries(PINNED_CARTOONS, "cartoons", 24),
      hydrateEntries(EXTRA_CARTOONS, "cartoons", 18),
      hydrateEntries(CURATED_FRENCH_CARTOONS, "cartoons", 12),
      fetchCinemetaCatalog("movie", "top", { genre: "Animation" }).catch(
        () => [] as CinemetaMeta[],
      ),
      fetchCinemetaCatalog("series", "top", { genre: "Animation" }).catch(
        () => [] as CinemetaMeta[],
      ),
      fetchCinemetaCatalog("movie", "year").catch(() => [] as CinemetaMeta[]),
      fetchCinemetaCatalog("series", "year").catch(() => [] as CinemetaMeta[]),
      loadFallbackCatalog()
        .then((c) => c.cartoons ?? [])
        .catch(() => [] as MediaItem[]),
    ]);

  const newAnimMovies = mapMetas(yearMovies, "cartoons", { filter: isAnimationMeta });
  const newAnimSeries = mapMetas(yearSeries, "cartoons", { filter: isAnimationMeta });
  const topAnimMovies = mapMetas(animMovies, "cartoons", {
    filter: (m) => !isJapaneseAnimeMeta(m),
  });
  const topAnimSeries = mapMetas(animSeries, "cartoons", {
    filter: (m) => !isJapaneseAnimeMeta(m),
  });

  const livePool = dedupe([
    ...frenchCartoons,
    ...pinned,
    ...extra,
    ...newAnimMovies,
    ...newAnimSeries,
    ...topAnimMovies,
    ...topAnimSeries,
  ]);
  const presentImdb = new Set(livePool.map((i) => i.imdbId).filter(Boolean));
  const extraFallback = fallback.filter((f) => !f.imdbId || !presentImdb.has(f.imdbId));

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
    ...extraFallback.filter((i) => i.mediaType === "movie"),
  ]);
  const seriesAll = dedupe([
    ...pinned.filter((i) => i.mediaType === "tv"),
    ...extra.filter((i) => i.mediaType === "tv"),
    ...newAnimSeries,
    ...topAnimSeries,
    ...extraFallback.filter((i) => i.mediaType === "tv"),
  ]);

  const items = dedupe([
    ...frenchCartoons,
    ...pinned,
    ...newReleases,
    ...extra,
    ...topAnimMovies,
    ...topAnimSeries,
    ...extraFallback,
  ]);
  const genreShelves = buildShelves(
    items,
    lang === "fr" ? "Dessins Animés" : "Cartoons",
    lang,
  ).filter((s) => s.id !== "trending");

  const shelves = [
    ...(lang === "fr" && frenchCartoons.length
      ? [
          {
            id: "french-selection",
            title: "Animation en Français & VF",
            items: dedupe([...frenchCartoons, ...pinned]).slice(0, 24),
          },
        ]
      : []),
    {
      id: "featured-favorites",
      title:
        lang === "fr"
          ? "Miraculous, Bad Guys, Boss Baby & Tortues Ninja"
          : "Miraculous, Bad Guys, Boss Baby & TMNT",
      items: dedupe([...pinned, ...frenchCartoons, ...extraFallback]).slice(0, 24),
    },
    ...(moviesAll.length
      ? [
          {
            id: "cartoon-movies",
            title: lang === "fr" ? "Films d'Animation (EN / FR)" : "English Animated Movies",
            items: moviesAll.slice(0, 24),
          },
        ]
      : []),
    ...(newReleases.length
      ? [
          {
            id: "new-releases",
            title: lang === "fr" ? "Nouvelles sorties animées" : "New Cartoon Releases",
            items: newReleases.slice(0, 24),
          },
        ]
      : []),
    {
      id: "trending",
      title: lang === "fr" ? "Dessins animés populaires" : "Popular Cartoons",
      items: interleave(extra, topAnimMovies, topAnimSeries, extraFallback).slice(0, 24),
    },
    ...(seriesAll.length
      ? [
          {
            id: "cartoon-series",
            title: lang === "fr" ? "Séries animées complètes" : "Full Cartoon Series",
            items: seriesAll.slice(0, 24),
          },
        ]
      : []),
    ...genreShelves,
  ].filter((s) => s.items.length >= 2);

  return {
    section: "cartoons",
    featured: pickFeatured(
      lang === "fr" && frenchCartoons.length
        ? [...frenchCartoons, ...pinned, ...items]
        : [...pinned, ...items],
      6,
    ),
    shelves,
    items,
    provider: "SHADOW Live Catalog",
  };
}

async function buildHollywoodCatalog(lang: CatalogLang): Promise<SectionCatalog> {
  const [
    curatedEnglish,
    frenchHits,
    frenchLiveEntries,
    newMoviesRaw,
    newSeriesRaw,
    topMoviesRaw,
    topSeriesRaw,
    ratedMoviesRaw,
    fallback,
  ] = await Promise.all([
    hydrateEntries(CURATED_HOLLYWOOD_ENGLISH, "hollywood", 16),
    lang === "fr"
      ? hydrateEntries(CURATED_FRENCH_MOVIES, "hollywood", 14)
      : Promise.resolve([] as MediaItem[]),
    lang === "fr" ? fetchWikidataImdbReleases("french") : Promise.resolve([] as CuratedEntry[]),
    fetchCinemetaCatalog("movie", "year").catch(() => [] as CinemetaMeta[]),
    fetchCinemetaCatalog("series", "year").catch(() => [] as CinemetaMeta[]),
    fetchCinemetaCatalog("movie", "top").catch(() => [] as CinemetaMeta[]),
    fetchCinemetaCatalog("series", "top").catch(() => [] as CinemetaMeta[]),
    fetchCinemetaCatalog("movie", "imdbRating").catch(() => [] as CinemetaMeta[]),
    loadFallbackCatalog()
      .then((c) => c.hollywood ?? [])
      .catch(() => [] as MediaItem[]),
  ]);

  const frenchCuratedIds = new Set(CURATED_FRENCH_MOVIES.map((c) => c.imdbId));
  const frenchLive =
    lang === "fr" && frenchLiveEntries.length
      ? await hydrateEntries(
          frenchLiveEntries.filter((e) => !frenchCuratedIds.has(e.imdbId)),
          "hollywood",
          10,
        )
      : [];

  const newMovies = mapMetas(newMoviesRaw, "hollywood", { filter: isEnglishOrGlobalHollywood });
  const newSeries = mapMetas(newSeriesRaw, "hollywood", { filter: isEnglishOrGlobalHollywood });
  const topMovies = mapMetas(topMoviesRaw, "hollywood", { filter: isEnglishOrGlobalHollywood });
  const topSeries = mapMetas(topSeriesRaw, "hollywood", { filter: isEnglishOrGlobalHollywood });
  const ratedMovies = mapMetas(ratedMoviesRaw, "hollywood", { filter: isEnglishOrGlobalHollywood });

  const frenchMerged = dedupe([...frenchHits, ...frenchLive]);
  const livePool = dedupe([
    ...frenchMerged,
    ...curatedEnglish,
    ...newMovies,
    ...newSeries,
    ...topMovies,
    ...topSeries,
    ...ratedMovies,
  ]);
  const presentImdb = new Set(livePool.map((i) => i.imdbId).filter(Boolean));
  const extraFallback = fallback.filter((f) => !f.imdbId || !presentImdb.has(f.imdbId));

  const englishMoviesAll = dedupe([
    ...curatedEnglish.filter((i) => i.mediaType === "movie"),
    ...newMovies,
    ...topMovies,
    ...ratedMovies,
    ...extraFallback.filter((i) => i.mediaType === "movie"),
  ]);
  const newReleases = interleave(newMovies, newSeries);
  const trending = interleave(englishMoviesAll, topSeries, extraFallback);
  const items = dedupe([
    ...frenchMerged,
    ...curatedEnglish,
    ...newReleases,
    ...trending,
    ...extraFallback,
  ]);
  const genreShelves = buildShelves(items, "Hollywood", lang).filter((s) => s.id !== "trending");

  const shelves = [
    ...(lang === "fr" && frenchMerged.length
      ? [
          {
            id: "french-selection",
            title: "Cinéma Français & VF",
            items: frenchMerged.slice(0, 24),
          },
        ]
      : []),
    ...(englishMoviesAll.length
      ? [
          {
            id: "hollywood-movies",
            title: lang === "fr" ? "Films Populaires (FR / EN)" : "English Blockbuster Movies",
            items: englishMoviesAll.slice(0, 24),
          },
        ]
      : []),
    ...(newReleases.length
      ? [
          {
            id: "new-releases",
            title: lang === "fr" ? "Nouveaux films & séries" : "New Movies & Series Just Out",
            items: newReleases.slice(0, 24),
          },
        ]
      : []),
    {
      id: "trending",
      title: lang === "fr" ? "Tendances Hollywood" : "Trending in Hollywood",
      items: trending.slice(0, 24),
    },
    ...(topSeries.length || extraFallback.some((i) => i.mediaType === "tv")
      ? [
          {
            id: "hollywood-series",
            title: lang === "fr" ? "Séries Hollywood" : "Hollywood Series",
            items: dedupe([
              ...curatedEnglish.filter((i) => i.mediaType === "tv"),
              ...newSeries,
              ...topSeries,
              ...extraFallback.filter((i) => i.mediaType === "tv"),
            ]).slice(0, 24),
          },
        ]
      : []),
    ...genreShelves,
  ].filter((s) => s.items.length >= 2);

  return {
    section: "hollywood",
    featured: pickFeatured(
      lang === "fr" && frenchMerged.length
        ? [...frenchMerged, ...curatedEnglish, ...topMovies, ...items]
        : [...curatedEnglish, ...topMovies, ...newMovies, ...items],
      6,
    ),
    shelves,
    items,
    provider: "SHADOW Live Catalog",
  };
}

async function buildRegionalCatalog(
  section: "bollywood" | "tollywood" | "nollywood" | "k-dramas",
  lang: CatalogLang,
): Promise<SectionCatalog> {
  const curated =
    section === "bollywood"
      ? CURATED_BOLLYWOOD
      : section === "tollywood"
        ? CURATED_TOLLYWOOD
        : section === "nollywood"
          ? CURATED_NOLLYWOOD
          : CURATED_KDRAMAS;

  const [liveEntries, curatedItems, fallback] = await Promise.all([
    fetchWikidataImdbReleases(section),
    hydrateEntries(curated, section, 24),
    loadFallbackCatalog()
      .then((c) => c[section] ?? [])
      .catch(() => [] as MediaItem[]),
  ]);

  const curatedIds = new Set(curated.map((c) => c.imdbId));
  const freshEntries = liveEntries.filter((e) => !curatedIds.has(e.imdbId));
  const freshItems = freshEntries.length ? await hydrateEntries(freshEntries, section, 16) : [];

  // Deduplicate fallback entries by imdbId so curated Cinemeta items (with richer posters/episode lists) win.
  const presentImdb = new Set(
    [...freshItems, ...curatedItems].map((i) => i.imdbId).filter(Boolean),
  );
  const uniqueFallback = fallback.filter((f) => !f.imdbId || !presentImdb.has(f.imdbId));

  const items = dedupe([...freshItems, ...curatedItems, ...uniqueFallback]);
  const label =
    section === "bollywood"
      ? "Bollywood"
      : section === "tollywood"
        ? "Tollywood"
        : section === "nollywood"
          ? "Nollywood"
          : "K-Dramas";
  const movies = items.filter((i) => i.mediaType === "movie");
  const series = items.filter((i) => i.mediaType !== "movie");
  const newReleases = dedupe([
    ...freshItems,
    ...items.filter((i) => (i.year ?? 0) >= new Date().getFullYear() - 2),
  ]);

  const genreShelves = buildShelves(items, label, lang).filter((s) => s.id !== "trending");
  const shelves = [
    ...(newReleases.length >= 2
      ? [
          {
            id: "new-releases",
            title: lang === "fr" ? `Nouveautés ${label}` : `New in ${label}`,
            items: newReleases.slice(0, 24),
          },
        ]
      : []),
    {
      id: "trending",
      title: lang === "fr" ? `Tendances ${label} (FR / EN)` : `Trending in ${label}`,
      items: items.slice(0, 24),
    },
    ...(movies.length >= 2
      ? [
          {
            id: `${section}-movies`,
            title: lang === "fr" ? `Films ${label}` : `${label} Movies`,
            items: movies.slice(0, 24),
          },
        ]
      : []),
    ...(series.length >= 2
      ? [
          {
            id: `${section}-series`,
            title: lang === "fr" ? `Séries ${label}` : `${label} Series`,
            items: series.slice(0, 24),
          },
        ]
      : []),
    ...genreShelves,
  ].filter((s) => s.items.length >= 2);

  return {
    section,
    featured: pickFeatured([...curatedItems, ...freshItems, ...items], 6),
    shelves,
    items,
    provider: "SHADOW Live Catalog",
  };
}

async function computeSectionCatalog(
  section: NonAnimeSection,
  lang: CatalogLang,
): Promise<SectionCatalog> {
  switch (section) {
    case "cartoons":
      return buildCartoonsCatalog(lang);
    case "hollywood":
      return buildHollywoodCatalog(lang);
    case "bollywood":
    case "tollywood":
    case "nollywood":
    case "k-dramas":
      return buildRegionalCatalog(section, lang);
  }
}

export const getLiveSectionCatalog = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        section: z.enum(NON_ANIME_SECTIONS),
        lang: z.enum(["en", "fr"]).default("en"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<SectionCatalog> => {
    const cacheKey = `${data.section}:${data.lang}`;
    const cached = sectionCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS && cached.catalog.items.length > 0) {
      return cached.catalog;
    }
    const existingFlight = inflight.get(cacheKey);
    if (existingFlight) return existingFlight;

    const promise = computeSectionCatalog(data.section, data.lang)
      .then((catalog) => {
        if (catalog.items.length > 0) {
          sectionCache.set(cacheKey, { ts: Date.now(), catalog });
        }
        return catalog;
      })
      .finally(() => {
        inflight.delete(cacheKey);
      });

    inflight.set(cacheKey, promise);
    return promise;
  });

async function searchImdbSuggestions(query: string): Promise<MediaItem[]> {
  try {
    const clean = query
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ");
    const firstChar = /^[a-z0-9]/.test(clean) ? clean[0]! : "x";
    const res = await fetch(
      `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(query.trim())}.json`,
      { signal: AbortSignal.timeout(4500) },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      d?: {
        id?: string;
        l?: string;
        qid?: string;
        y?: number;
        i?: { imageUrl?: string };
      }[];
    };

    const out: MediaItem[] = [];
    for (const entry of json.d ?? []) {
      if (!entry.id || !/^tt\d{5,10}$/.test(entry.id) || !entry.l) continue;
      if (entry.qid !== "movie" && entry.qid !== "tvSeries" && entry.qid !== "tvMiniSeries") {
        continue;
      }
      const type: "movie" | "series" = entry.qid === "movie" ? "movie" : "series";
      const isCartoon =
        /bad guys|boss baby|ninja turtles|spider-man|inside out|moana|minions|kung fu/i.test(
          entry.l,
        );
      const poster =
        entry.i?.imageUrl ?? `https://images.metahub.space/poster/medium/${entry.id}/img`;
      out.push({
        key: `cinemeta:${type}-${entry.id}`,
        id: `${type}-${entry.id}`,
        source: "cinemeta",
        section: isCartoon ? "cartoons" : "hollywood",
        title: entry.l,
        poster,
        posterHd: entry.i?.imageUrl ?? `https://images.metahub.space/poster/large/${entry.id}/img`,
        backdrop: `https://images.metahub.space/background/medium/${entry.id}/img`,
        year: entry.y ?? null,
        genres: isCartoon ? ["Animation"] : [],
        description: "",
        mediaType: type === "movie" ? "movie" : "tv",
        imdbId: entry.id,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export const searchMediaCatalog = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        q: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<MediaItem[]> => {
    const q = data.q.trim();
    if (q.length < 2) return [];

    const [moviesRaw, seriesRaw, imdbHits] = await Promise.all([
      fetchCinemetaCatalog("movie", "top", { search: q }).catch(() => [] as CinemetaMeta[]),
      fetchCinemetaCatalog("series", "top", { search: q }).catch(() => [] as CinemetaMeta[]),
      searchImdbSuggestions(q),
    ]);

    const cinemetaItems = [
      ...moviesRaw.map((m) => mapCinemetaItem(m)).filter((x): x is MediaItem => x !== null),
      ...seriesRaw.map((s) => mapCinemetaItem(s)).filter((x): x is MediaItem => x !== null),
    ];

    // Also search cached section items immediately in case external catalogs miss a curated franchise.
    const qLower = q.toLowerCase();
    const cachedMatches: MediaItem[] = [];
    for (const cached of sectionCache.values()) {
      for (const item of cached.catalog.items) {
        if (
          item.title.toLowerCase().includes(qLower) ||
          item.englishTitle?.toLowerCase().includes(qLower) ||
          item.romajiTitle?.toLowerCase().includes(qLower)
        ) {
          cachedMatches.push(item);
        }
      }
    }

    return dedupe([...cachedMatches, ...cinemetaItems, ...imdbHits]).slice(0, 60);
  });
