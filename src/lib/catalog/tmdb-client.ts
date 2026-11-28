import { cachedAsync } from "@/lib/cache/client-cache";
import {
  fetchTmdbDetailWithKey,
  fetchTmdbSectionWithKey,
  fetchTmdbVideosWithKey,
  searchTmdbTrailerWithKey,
  type TmdbLang,
  type TmdbSection,
} from "./tmdb-shared";
import type { MediaDetail, MediaItem } from "./types";

const TMDB_LOCAL_CACHE_MS = 1000 * 60 * 30;

function getPublicTmdbKey(): string | null {
  try {
    const raw = (import.meta.env as Record<string, unknown> | undefined)?.["VITE_TMDB_API_KEY"];
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function hasPublicTmdbKey(): boolean {
  return getPublicTmdbKey() !== null;
}

export async function fetchTmdbSectionDirect(
  section: TmdbSection,
  lang: TmdbLang,
): Promise<{ enabled: boolean; items: MediaItem[] } | null> {
  const key = getPublicTmdbKey();
  if (!key) return null;
  return cachedAsync(
    `tmdb:section:${section}:${lang}`,
    TMDB_LOCAL_CACHE_MS,
    () => fetchTmdbSectionWithKey(section, lang, key),
    { persist: "local" },
  );
}

export async function fetchTmdbDetailDirect(
  id: string,
  lang: TmdbLang,
): Promise<MediaDetail | null | undefined> {
  const key = getPublicTmdbKey();
  if (!key) return undefined;
  return cachedAsync(
    `tmdb:detail:${id}:${lang}`,
    TMDB_LOCAL_CACHE_MS,
    () => fetchTmdbDetailWithKey(id, lang, key),
    { persist: "local" },
  );
}

export async function fetchTmdbTrailerDirect(
  type: "tv" | "movie" | null,
  idOrTitle: string,
): Promise<string | null | undefined> {
  const key = getPublicTmdbKey();
  if (!key) return undefined;
  return cachedAsync(
    `tmdb:trailer:${type ?? "search"}:${idOrTitle}`,
    TMDB_LOCAL_CACHE_MS,
    () =>
      type
        ? fetchTmdbVideosWithKey(type, idOrTitle, key)
        : searchTmdbTrailerWithKey(idOrTitle, key),
    { persist: "local" },
  );
}
