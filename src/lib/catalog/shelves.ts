import { matchesGenre } from "./genres";
import type { MediaItem, Shelf } from "./types";

const byPopularity = (a: MediaItem, b: MediaItem) => (b.popularity ?? 0) - (a.popularity ?? 0);
const byRating = (a: MediaItem, b: MediaItem) => (b.rating ?? 0) - (a.rating ?? 0);

export function dedupe(items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}

/** Round-robin merge so one source never floods a mixed shelf. */
export function interleave(...lists: MediaItem[][]): MediaItem[] {
  const out: MediaItem[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]!);
  return dedupe(out);
}

export function buildShelves(items: MediaItem[], label: string): Shelf[] {
  const sorted = [...items].sort(byPopularity);
  const pick = (fn: (i: MediaItem) => boolean) => sorted.filter(fn).slice(0, 24);
  const shelves: Shelf[] = [
    { id: "trending", title: `Trending in ${label}`, items: sorted.slice(0, 24) },
    { id: "action", title: "Action Blockbusters", items: pick((i) => matchesGenre(i, "action")) },
    { id: "horror", title: "Zombie & Horror", items: pick((i) => matchesGenre(i, "horror")) },
    { id: "scifi", title: "Sci-Fi Epics", items: pick((i) => matchesGenre(i, "scifi")) },
    { id: "drama", title: "Heartfelt Drama", items: pick((i) => matchesGenre(i, "drama")) },
    { id: "comedy", title: "Laugh Out Loud", items: pick((i) => matchesGenre(i, "comedy")) },
    {
      id: "top",
      title: "Top Rated",
      items: [...items].filter((i) => (i.rating ?? 0) > 0).sort(byRating).slice(0, 24),
    },
  ];
  return shelves.filter((s) => s.items.length >= 4);
}

export function pickFeatured(items: MediaItem[], count = 5): MediaItem[] {
  return items.filter((i) => i.backdrop).slice(0, count);
}
