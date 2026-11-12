import { itemKey, type MediaItem, type SectionId } from "./types";

type RawItem = Omit<MediaItem, "key" | "source" | "section"> & { popularity?: number | null };
type FallbackSection = Exclude<SectionId, "anime">;

let cache: Promise<Record<FallbackSection, MediaItem[]>> | null = null;

/** Structured JSON fallback (TVmaze snapshot) used when TMDB is not configured. */
export function loadFallbackCatalog() {
  cache ??= import("@/data/tvmaze-catalog.json").then((mod) => {
    const raw = (mod.default ?? mod) as unknown as Record<FallbackSection, RawItem[]>;
    const out = {} as Record<FallbackSection, MediaItem[]>;
    for (const section of Object.keys(raw) as FallbackSection[]) {
      out[section] = raw[section].map((r) => ({
        ...r,
        key: itemKey("tvmaze", r.id),
        source: "tvmaze" as const,
        section,
        mediaType: "tv" as const,
      }));
    }
    return out;
  });
  return cache;
}
