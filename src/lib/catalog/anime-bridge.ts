import { cachedAsync } from "@/lib/cache/client-cache";
import { searchAnime } from "./anilist";
import type { MediaItem, Source } from "./types";

const BRIDGE_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

export function normalizeAnimeTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\(\d{4}\)\s*$/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAnimeItem(
  item?: Partial<Pick<MediaItem, "source" | "section" | "genres" | "language">> | null,
): boolean {
  if (!item) return false;
  if (item.source === "anilist") return true;
  if (item.section === "anime") return true;
  const genres = (item.genres ?? []).map((g) => g.toLowerCase());
  if (genres.includes("anime")) return true;
  if (
    item.language?.toLowerCase().includes("japanese") &&
    genres.some((g) => g.includes("animation"))
  ) {
    return true;
  }
  return false;
}

/**
 * Collapses Cinemeta/TVMaze/TMDB duplicates of anime titles (such as Black Clover)
 * whenever the canonical AniList entry is present in the same result set.
 */
export function dedupeSearchAnimePriority(items: MediaItem[]): MediaItem[] {
  const anilistTitles = new Set<string>();
  for (const item of items) {
    if (item.source !== "anilist") continue;
    for (const t of [item.title, item.englishTitle, item.romajiTitle]) {
      const norm = normalizeAnimeTitle(t);
      if (norm.length >= 2) anilistTitles.add(norm);
    }
  }

  const seenKeys = new Set<string>();
  const out: MediaItem[] = [];
  for (const item of items) {
    if (seenKeys.has(item.key)) continue;
    if (item.source !== "anilist") {
      const norm = normalizeAnimeTitle(item.title);
      if (norm && anilistTitles.has(norm)) {
        continue;
      }
    }
    seenKeys.add(item.key);
    out.push(item);
  }
  return out;
}

function titleSimilarity(a: string, b: string): number {
  const na = normalizeAnimeTitle(a);
  const nb = normalizeAnimeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wa = new Set(na.split(" ").filter((w) => w.length > 1));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 1));
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) {
    if (wb.has(w)) shared++;
  }
  return shared / Math.max(wa.size, wb.size);
}

export async function resolveAniListIdForItem(params: {
  source: Source;
  id: string;
  title?: string | null | undefined;
  englishTitle?: string | null | undefined;
  imdbId?: string | null | undefined;
}): Promise<string | null> {
  if (params.source === "anilist" && /^\d+$/.test(params.id)) {
    return params.id;
  }

  const imdb =
    params.imdbId ??
    (/^(movie|series)-(tt\d{5,10})$/.exec(params.id)?.[2] ||
      (/^tt\d{5,10}$/.test(params.id) ? params.id : null));
  const cleanTitle = (params.englishTitle || params.title || "").trim();
  if (!imdb && cleanTitle.length < 2) return null;

  return cachedAsync<string | null>(
    `anime-bridge:${params.source}:${params.id}:${imdb ?? ""}:${cleanTitle.toLowerCase()}`,
    BRIDGE_CACHE_TTL_MS,
    async () => {
      if (imdb) {
        try {
          const res = await fetch(
            `https://api.ani.zip/mappings?imdb_id=${encodeURIComponent(imdb)}`,
            {
              headers: { Accept: "application/json" },
              signal: AbortSignal.timeout(3500),
            },
          );
          if (res.ok) {
            const json = (await res.json()) as {
              titles?: Record<string, string | null | undefined>;
              mappings?: { anilist_id?: string | number | null; type?: string | null };
            };
            const mapped = json.mappings?.anilist_id ? String(json.mappings.anilist_id) : null;
            const mappedType = (json.mappings?.type ?? "").toUpperCase();
            const mappedTitles = Object.values(json.titles ?? {}).filter(
              (t): t is string => typeof t === "string" && t.trim().length > 0,
            );
            const titleMatches =
              cleanTitle.length < 2 ||
              mappedTitles.length === 0 ||
              mappedTitles.some((mt) => titleSimilarity(cleanTitle, mt) >= 0.75);
            const isMismatchedOva =
              cleanTitle.length >= 2 &&
              (mappedType === "OVA" || mappedType === "SPECIAL") &&
              !titleMatches;
            if (mapped && /^\d+$/.test(mapped) && !isMismatchedOva && titleMatches) {
              return mapped;
            }
          }
        } catch {
          /* fall through to AniList title search */
        }
      }

      if (cleanTitle.length >= 2) {
        try {
          const hits = await searchAnime(cleanTitle, "en");
          const scored = hits
            .map((h) => ({
              id: h.id,
              score: Math.max(
                titleSimilarity(cleanTitle, h.title),
                titleSimilarity(cleanTitle, h.englishTitle ?? ""),
                titleSimilarity(cleanTitle, h.romajiTitle ?? ""),
              ),
            }))
            .sort((a, b) => b.score - a.score);
          if (scored[0] && scored[0].score >= 0.75 && /^\d+$/.test(scored[0].id)) {
            return scored[0].id;
          }
        } catch {
          /* ignore lookup failures */
        }
      }

      return null;
    },
    { persist: "session" },
  );
}
