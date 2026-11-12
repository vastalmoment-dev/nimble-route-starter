import type { MediaItem } from "./types";

export type GenreChipId = "action" | "scifi" | "horror" | "drama" | "animation" | "comedy";

export const GENRE_CHIPS: { id: GenreChipId; label: string }[] = [
  { id: "action", label: "Action" },
  { id: "scifi", label: "Sci-Fi" },
  { id: "horror", label: "Horror / Zombie" },
  { id: "drama", label: "Drama" },
  { id: "animation", label: "Animation" },
  { id: "comedy", label: "Comedy" },
];

const GENRE_ALIASES: Record<GenreChipId, string[]> = {
  action: ["action", "adventure", "martial arts", "war", "action & adventure", "espionage"],
  scifi: ["sci-fi", "science-fiction", "science fiction", "sci-fi & fantasy", "mecha"],
  horror: ["horror", "zombie", "supernatural thriller"],
  drama: ["drama", "romance", "family", "legal", "medical"],
  animation: ["animation", "anime"],
  comedy: ["comedy"],
};

export function isGenreChipId(value: unknown): value is GenreChipId {
  return typeof value === "string" && GENRE_CHIPS.some((c) => c.id === value);
}

/** True when the item belongs to the chip's genre family. */
export function matchesGenre(item: MediaItem, chip: GenreChipId): boolean {
  const genres = item.genres.map((g) => g.toLowerCase());
  if (genres.some((g) => GENRE_ALIASES[chip].includes(g))) return true;
  if (chip === "animation") return item.source === "anilist" || item.section === "cartoons";
  if (chip === "horror") return /\bzombie|undead|the dead\b/i.test(`${item.title} ${item.description}`);
  return false;
}

export function filterByGenres(items: MediaItem[], chips: GenreChipId[]): MediaItem[] {
  if (chips.length === 0) return items;
  return items.filter((item) => chips.some((chip) => matchesGenre(item, chip)));
}
