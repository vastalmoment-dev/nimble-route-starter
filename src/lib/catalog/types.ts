export type Source = "anilist" | "tvmaze" | "tmdb";
export type SectionId = "anime" | "k-dramas" | "hollywood" | "bollywood" | "cartoons";

export interface MediaItem {
  /** Globally unique: `${source}:${id}` */
  key: string;
  id: string;
  source: Source;
  section: SectionId;
  title: string;
  poster: string | null;
  posterHd?: string | null;
  backdrop?: string | null;
  year?: number | null;
  /** Normalized 0–10 */
  rating?: number | null;
  genres: string[];
  description: string;
  language?: string | null;
  network?: string | null;
  status?: string | null;
  runtime?: number | null;
  episodesCount?: number | null;
  /** Rank-only signal inside a single source; never compare across sources. */
  popularity?: number | null;
  mediaType?: "tv" | "movie";
}

export interface Episode {
  id: string;
  number: number;
  season?: number | null;
  title: string;
  thumbnail?: string | null;
  description?: string | null;
  runtime?: number | null;
}

export interface CastMember {
  name: string;
  role?: string | null;
  image?: string | null;
}

export interface MediaDetail extends MediaItem {
  episodes: Episode[];
  cast: CastMember[];
  /** Official legal places to watch (e.g. Crunchyroll, Netflix). */
  watchLinks?: { site: string; url: string }[];
}

export interface Shelf {
  id: string;
  title: string;
  items: MediaItem[];
}

export interface SectionCatalog {
  section: SectionId | "home";
  featured: MediaItem[];
  shelves: Shelf[];
  /** Every distinct item across shelves, used for genre filtering. */
  items: MediaItem[];
  provider: string;
}

export const SECTION_META: Record<SectionId, { label: string; tagline: string; colorClass: string }> = {
  anime: { label: "Anime", tagline: "Shōnen legends, seasonal hits and cult classics.", colorClass: "text-genre-anime" },
  "k-dramas": { label: "K-Dramas", tagline: "Seoul after dark — romance, revenge and survival.", colorClass: "text-genre-kdrama" },
  hollywood: { label: "Hollywood", tagline: "Prestige series and blockbuster storytelling.", colorClass: "text-genre-hollywood" },
  bollywood: { label: "Bollywood / Tollywood", tagline: "Spectacle, family sagas and gritty crime from India.", colorClass: "text-genre-bollywood" },
  cartoons: { label: "Cartoons", tagline: "Animated worlds for every age.", colorClass: "text-genre-cartoons" },
};

export const itemKey = (source: Source, id: string) => `${source}:${id}`;

export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
