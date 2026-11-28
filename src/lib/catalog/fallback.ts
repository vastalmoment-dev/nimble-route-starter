import { itemKey, type MediaItem, type SectionId } from "./types";

type RawItem = Omit<MediaItem, "key" | "source" | "section"> & { popularity?: number | null };
type FallbackSection = Exclude<SectionId, "anime">;

interface StaticCinemetaSeed {
  imdbId: string;
  title: string;
  mediaType: "movie" | "tv";
  year: number;
  rating: number;
  genres: string[];
  language: string;
  description: string;
}

function mapCinemetaSeed(
  section: FallbackSection,
  seed: StaticCinemetaSeed,
  idx: number,
): MediaItem {
  const prefix = seed.mediaType === "movie" ? "movie" : "series";
  const id = `${prefix}-${seed.imdbId}`;
  return {
    key: itemKey("cinemeta", id),
    id,
    source: "cinemeta",
    section,
    title: seed.title,
    poster: `https://images.metahub.space/poster/medium/${seed.imdbId}/img`,
    posterHd: `https://images.metahub.space/poster/large/${seed.imdbId}/img`,
    backdrop: `https://images.metahub.space/background/medium/${seed.imdbId}/img`,
    year: seed.year,
    rating: seed.rating,
    genres: seed.genres,
    description: seed.description,
    language: seed.language,
    mediaType: seed.mediaType,
    imdbId: seed.imdbId,
    popularity: 4000 - idx * 25,
  };
}

const STATIC_SEEDS: Record<Exclude<FallbackSection, "k-dramas">, StaticCinemetaSeed[]> = {
  hollywood: [
    {
      imdbId: "tt15239678",
      title: "Dune: Part Two",
      mediaType: "movie",
      year: 2024,
      rating: 8.5,
      genres: ["Action", "Adventure", "Sci-Fi"],
      language: "English",
      description:
        "Paul Atreides unites with the Fremen while on a warpath of revenge against the conspirators who destroyed his family.",
    },
    {
      imdbId: "tt6263850",
      title: "Deadpool & Wolverine",
      mediaType: "movie",
      year: 2024,
      rating: 7.7,
      genres: ["Action", "Comedy", "Sci-Fi"],
      language: "English",
      description:
        "Deadpool is offered a place in the Marvel Cinematic Universe by the Time Variance Authority, recruiting Wolverine to save his world.",
    },
    {
      imdbId: "tt15398776",
      title: "Oppenheimer",
      mediaType: "movie",
      year: 2023,
      rating: 8.3,
      genres: ["Biography", "Drama", "History"],
      language: "English",
      description:
        "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.",
    },
    {
      imdbId: "tt0816692",
      title: "Interstellar",
      mediaType: "movie",
      year: 2014,
      rating: 8.7,
      genres: ["Adventure", "Drama", "Sci-Fi"],
      language: "English",
      description:
        "When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot leads a mission through a wormhole to find a new home.",
    },
    {
      imdbId: "tt0903747",
      title: "Breaking Bad",
      mediaType: "tv",
      year: 2008,
      rating: 9.5,
      genres: ["Crime", "Drama", "Thriller"],
      language: "English",
      description:
        "A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine with a former student.",
    },
    {
      imdbId: "tt3581920",
      title: "The Last of Us",
      mediaType: "tv",
      year: 2023,
      rating: 8.7,
      genres: ["Action", "Adventure", "Drama"],
      language: "English",
      description:
        "After a global pandemic destroys civilization, a hardened survivor takes charge of a 14-year-old girl who may be humanity's last hope.",
    },
  ],
  bollywood: [
    {
      imdbId: "tt15354916",
      title: "Jawan",
      mediaType: "movie",
      year: 2023,
      rating: 7.0,
      genres: ["Action", "Thriller"],
      language: "Hindi",
      description:
        "A high-octane action thriller outlining the emotional journey of a man set to rectify the wrongs in society.",
    },
    {
      imdbId: "tt12844910",
      title: "Pathaan",
      mediaType: "movie",
      year: 2023,
      rating: 5.9,
      genres: ["Action", "Adventure", "Thriller"],
      language: "Hindi",
      description:
        "An Indian agent races against a doomsday clock as a ruthless mercenary plots an apocalyptic attack.",
    },
    {
      imdbId: "tt27510174",
      title: "Stree 2",
      mediaType: "movie",
      year: 2024,
      rating: 7.0,
      genres: ["Comedy", "Horror"],
      language: "Hindi",
      description:
        "After the events of Stree, the town of Chanderi is haunted again by a terrifying headless entity known as Sarkata.",
    },
    {
      imdbId: "tt1187043",
      title: "3 Idiots",
      mediaType: "movie",
      year: 2009,
      rating: 8.4,
      genres: ["Comedy", "Drama"],
      language: "Hindi",
      description:
        "Two friends search for their long-lost companion while revisiting their college days and the friend who inspired them.",
    },
    {
      imdbId: "tt6077448",
      title: "Sacred Games",
      mediaType: "tv",
      year: 2018,
      rating: 8.5,
      genres: ["Action", "Crime", "Drama"],
      language: "Hindi",
      description:
        "A link in their pasts leads an honest cop to a fugitive gang boss whose cryptic warning spurs a quest to save Mumbai.",
    },
    {
      imdbId: "tt6473300",
      title: "Mirzapur",
      mediaType: "tv",
      year: 2018,
      rating: 8.5,
      genres: ["Action", "Crime", "Drama"],
      language: "Hindi",
      description:
        "A shocking incident at a wedding procession ignites a chain of events entangling two families in the lawless city of Mirzapur.",
    },
  ],
  tollywood: [
    {
      imdbId: "tt8178634",
      title: "RRR",
      mediaType: "movie",
      year: 2022,
      rating: 7.8,
      genres: ["Action", "Drama"],
      language: "Telugu",
      description:
        "A fearless warrior on a perilous mission comes face to face with a steely cop serving British forces in 1920s India.",
    },
    {
      imdbId: "tt16539454",
      title: "Pushpa 2: The Rule",
      mediaType: "movie",
      year: 2024,
      rating: 6.4,
      genres: ["Action", "Crime", "Drama"],
      language: "Telugu",
      description:
        "Pushpa Raj's rule expands as the red sandalwood smuggler faces powerful adversaries across borders.",
    },
    {
      imdbId: "tt12735488",
      title: "Kalki 2898 AD",
      mediaType: "movie",
      year: 2024,
      rating: 7.0,
      genres: ["Action", "Adventure", "Sci-Fi"],
      language: "Telugu",
      description:
        "A modern avatar of the Hindu god Vishnu descends to Earth to protect the world from evil forces in a dystopian future.",
    },
    {
      imdbId: "tt2631186",
      title: "Baahubali: The Beginning",
      mediaType: "movie",
      year: 2015,
      rating: 8.0,
      genres: ["Action", "Drama"],
      language: "Telugu",
      description:
        "In ancient India, an adventurous and daring man becomes involved in a decades-old feud between two warring peoples.",
    },
    {
      imdbId: "tt19868374",
      title: "Dhootha",
      mediaType: "tv",
      year: 2023,
      rating: 7.8,
      genres: ["Mystery", "Horror", "Thriller"],
      language: "Telugu",
      description:
        "A journalist's life turns upside down when eerie newspaper clippings begin predicting fatal tragedies around him.",
    },
    {
      imdbId: "tt15471900",
      title: "Rana Naidu",
      mediaType: "tv",
      year: 2023,
      rating: 7.1,
      genres: ["Action", "Crime", "Drama"],
      language: "Telugu",
      description:
        "Rana Naidu is the go-to fixer for the rich and famous until his estranged father is suddenly released from prison.",
    },
  ],
  nollywood: [
    {
      imdbId: "tt24083908",
      title: "The Black Book",
      mediaType: "movie",
      year: 2023,
      rating: 5.9,
      genres: ["Action", "Drama", "Thriller"],
      language: "English",
      description:
        "After his son is framed for a kidnapping, a bereaved deacon takes justice into his own hands against a corrupt gang.",
    },
    {
      imdbId: "tt28546464",
      title: "Jagun Jagun",
      mediaType: "movie",
      year: 2023,
      rating: 6.5,
      genres: ["Action", "Drama", "History"],
      language: "Yoruba",
      description:
        "A young man determined to become a powerful warrior joins an elite army and draws the ire of a ruthless warlord.",
    },
    {
      imdbId: "tt19704612",
      title: "Gangs of Lagos",
      mediaType: "movie",
      year: 2023,
      rating: 5.9,
      genres: ["Action", "Crime", "Drama"],
      language: "English",
      description:
        "A group of friends who each have to navigate their own destiny, growing up on the bustling streets of Isale Eko, Lagos.",
    },
    {
      imdbId: "tt19398068",
      title: "Blood Sisters",
      mediaType: "tv",
      year: 2022,
      rating: 6.5,
      genres: ["Crime", "Drama", "Thriller"],
      language: "English",
      description:
        "Bound by a dangerous secret, best friends Sarah and Kemi are forced to go on the run after a wealthy groom disappears.",
    },
    {
      imdbId: "tt22099034",
      title: "Shanty Town",
      mediaType: "tv",
      year: 2023,
      rating: 6.2,
      genres: ["Crime", "Drama", "Thriller"],
      language: "English",
      description:
        "A group of courtesans attempts to escape the grasp of a notorious kingpin—but political corruption and blood ties make freedom near impossible.",
    },
  ],
  cartoons: [
    {
      imdbId: "tt2580046",
      title: "Miraculous: Tales of Ladybug & Cat Noir",
      mediaType: "tv",
      year: 2015,
      rating: 7.5,
      genres: ["Animation", "Action", "Adventure"],
      language: "English",
      description:
        "Marinette and Adrien transform into superheroes Ladybug and Cat Noir to protect Paris from the mysterious Hawk Moth.",
    },
    {
      imdbId: "tt10364034",
      title: "Miraculous: Ladybug & Cat Noir, the Movie",
      mediaType: "movie",
      year: 2023,
      rating: 6.1,
      genres: ["Animation", "Action", "Adventure"],
      language: "English",
      description:
        "An ordinary teenager in Paris discovers magical powers as Ladybug and teams up with Cat Noir to save the city.",
    },
    {
      imdbId: "tt8115900",
      title: "The Bad Guys",
      mediaType: "movie",
      year: 2022,
      rating: 6.8,
      genres: ["Animation", "Adventure", "Comedy"],
      language: "English",
      description:
        "Several reformed yet misunderstood criminal animals attempt to become good, with disastrous results along the way.",
    },
    {
      imdbId: "tt9362722",
      title: "Spider-Man: Across the Spider-Verse",
      mediaType: "movie",
      year: 2023,
      rating: 8.6,
      genres: ["Animation", "Action", "Adventure"],
      language: "English",
      description:
        "Miles Morales catapults across the multiverse, where he encounters a team of Spider-People charged with protecting its existence.",
    },
    {
      imdbId: "tt22022452",
      title: "Inside Out 2",
      mediaType: "movie",
      year: 2024,
      rating: 7.6,
      genres: ["Animation", "Adventure", "Comedy"],
      language: "English",
      description:
        "A sequel that features Riley entering puberty and experiencing brand new, more complex emotions inside Headquarters.",
    },
    {
      imdbId: "tt0417299",
      title: "Avatar: The Last Airbender",
      mediaType: "tv",
      year: 2005,
      rating: 9.3,
      genres: ["Animation", "Action", "Adventure"],
      language: "English",
      description:
        "In a war-torn world of elemental magic, a young boy reawakens to undertake a dangerous mystic quest to fulfill his destiny as the Avatar.",
    },
    {
      imdbId: "tt11126994",
      title: "Arcane",
      mediaType: "tv",
      year: 2021,
      rating: 9.0,
      genres: ["Animation", "Action", "Adventure"],
      language: "English",
      description:
        "Set in Utopian Piltover and the oppressed underground of Zaun, the story follows the origins of two iconic champions.",
    },
    {
      imdbId: "tt7741824",
      title: "The Boss Baby: Back in Business",
      mediaType: "tv",
      year: 2018,
      rating: 6.6,
      genres: ["Animation", "Comedy", "Family"],
      language: "English",
      description:
        "Boss Baby brings his big brother Tim into the office to teach him the art of business at Baby Corp.",
    },
  ],
};

const ANIME_FALLBACK_SEEDS: MediaItem[] = [
  {
    key: itemKey("anilist", "16498"),
    id: "16498",
    source: "anilist",
    section: "anime",
    title: "Attack on Titan",
    englishTitle: "Attack on Titan",
    romajiTitle: "Shingeki no Kyojin",
    malId: 16498,
    poster:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx16498-73IhOXpJZiMF.jpg",
    posterHd:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-73IhOXpJZiMF.jpg",
    backdrop: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg",
    year: 2013,
    rating: 8.5,
    genres: ["Action", "Drama", "Fantasy"],
    description:
      "Several hundred years ago, humans were nearly exterminated by Titans. A small percentage survived by walling themselves inside a city.",
    language: "Japanese",
    episodesCount: 25,
    latestEpisode: 25,
    popularity: 850000,
    mediaType: "tv",
  },
  {
    key: itemKey("anilist", "21"),
    id: "21",
    source: "anilist",
    section: "anime",
    title: "One Piece",
    englishTitle: "One Piece",
    romajiTitle: "One Piece",
    malId: 21,
    poster: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21-YCDoj1EkAxFn.jpg",
    posterHd: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCDoj1EkAxFn.jpg",
    backdrop: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-wf37VakJmZqs.jpg",
    year: 1999,
    rating: 8.8,
    genres: ["Action", "Adventure", "Comedy"],
    description:
      "Monkey D. Luffy sails with his Straw Hat Pirates in search of the legendary treasure One Piece to become King of the Pirates.",
    language: "Japanese",
    episodesCount: 1122,
    latestEpisode: 1122,
    popularity: 720000,
    mediaType: "tv",
  },
  {
    key: itemKey("anilist", "151807"),
    id: "151807",
    source: "anilist",
    section: "anime",
    title: "Solo Leveling",
    englishTitle: "Solo Leveling",
    romajiTitle: "Ore dake Level Up na Ken",
    malId: 52299,
    poster:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx151807-m1gX3iwfIsLu.png",
    posterHd:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-m1gX3iwfIsLu.png",
    backdrop: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/151807-37qyf3FH5M2n.jpg",
    year: 2024,
    rating: 8.2,
    genres: ["Action", "Adventure", "Fantasy"],
    description:
      "In a world of gifted hunters and monsters, weak hunter Sung Jinwoo gains extraordinary powers through a mysterious program called the System.",
    language: "Japanese",
    episodesCount: 12,
    latestEpisode: 12,
    popularity: 620000,
    mediaType: "tv",
  },
  {
    key: itemKey("anilist", "113415"),
    id: "113415",
    source: "anilist",
    section: "anime",
    title: "JUJUTSU KAISEN",
    englishTitle: "JUJUTSU KAISEN",
    romajiTitle: "Jujutsu Kaisen",
    malId: 40748,
    poster:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx113415-bbBWj4pEFseh.jpg",
    posterHd:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-bbBWj4pEFseh.jpg",
    backdrop: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/113415-jQLeej8j1V7o.jpg",
    year: 2020,
    rating: 8.5,
    genres: ["Action", "Drama", "Supernatural"],
    description:
      "A boy swallows a cursed talisman—the finger of a demon—and becomes cursed himself, entering a shaman's school to locate the demon's remaining body parts.",
    language: "Japanese",
    episodesCount: 24,
    latestEpisode: 24,
    popularity: 790000,
    mediaType: "tv",
  },
  {
    key: itemKey("anilist", "101922"),
    id: "101922",
    source: "anilist",
    section: "anime",
    title: "Demon Slayer: Kimetsu no Yaiba",
    englishTitle: "Demon Slayer: Kimetsu no Yaiba",
    romajiTitle: "Kimetsu no Yaiba",
    malId: 38000,
    poster:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx101922-WZkH03R2aQ0u.jpg",
    posterHd:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WZkH03R2aQ0u.jpg",
    backdrop: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-YfZhKBUDDS6L.jpg",
    year: 2019,
    rating: 8.3,
    genres: ["Action", "Adventure", "Drama"],
    description:
      "A family is attacked by demons and only two members survive—Tanjiro and his sister Nezuko, who is turning into a demon slowly.",
    language: "Japanese",
    episodesCount: 26,
    latestEpisode: 26,
    popularity: 820000,
    mediaType: "tv",
  },
  {
    key: itemKey("anilist", "154587"),
    id: "154587",
    source: "anilist",
    section: "anime",
    title: "Frieren: Beyond Journey's End",
    englishTitle: "Frieren: Beyond Journey's End",
    romajiTitle: "Sousou no Frieren",
    malId: 52991,
    poster:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx154587-gHSraOSa0nBI.jpg",
    posterHd:
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-gHSraOSa0nBI.jpg",
    backdrop: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587-ivX007655492.jpg",
    year: 2023,
    rating: 9.1,
    genres: ["Adventure", "Drama", "Fantasy"],
    description:
      "After a ten-year quest to defeat the Demon King, elven mage Frieren embarks on a new journey to understand humanity.",
    language: "Japanese",
    episodesCount: 28,
    latestEpisode: 28,
    popularity: 590000,
    mediaType: "tv",
  },
];

let cache: Promise<Record<FallbackSection, MediaItem[]>> | null = null;

/** Structured JSON + verified Cinemeta seed fallback used when upstream endpoints are unreachable. */
export function loadFallbackCatalog() {
  cache ??= import("@/data/tvmaze-catalog.json").then((mod) => {
    const raw = (mod.default ?? mod) as unknown as Partial<Record<FallbackSection, RawItem[]>>;
    const out = {} as Record<FallbackSection, MediaItem[]>;

    out["k-dramas"] = (raw["k-dramas"] ?? []).map((r) => ({
      ...r,
      key: itemKey("tvmaze", r.id),
      source: "tvmaze" as const,
      section: "k-dramas",
      mediaType: "tv" as const,
    }));

    for (const section of Object.keys(STATIC_SEEDS) as (keyof typeof STATIC_SEEDS)[]) {
      const jsonItems = (raw[section] ?? []).map((r) => ({
        ...r,
        key: itemKey("tvmaze", r.id),
        source: "tvmaze" as const,
        section,
        mediaType: r.mediaType ?? ("tv" as const),
      }));
      const seedItems = STATIC_SEEDS[section].map((seed, idx) =>
        mapCinemetaSeed(section, seed, idx),
      );
      out[section] = [...jsonItems, ...seedItems];
    }

    return out;
  });
  return cache;
}

export function loadAnimeFallbackCatalog(): MediaItem[] {
  return ANIME_FALLBACK_SEEDS;
}
