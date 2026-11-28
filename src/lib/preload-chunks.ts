const warmed = new Set<string>();

const CHUNK_LOADERS: Record<string, (() => Promise<unknown>)[]> = {
  "/": [() => import("@/components/media/SectionPage")],
  "/anime": [
    () => import("@/components/media/SectionPage"),
    () => import("@/components/media/AnimeCatalogGrid"),
  ],
  "/k-dramas": [() => import("@/components/media/SectionPage")],
  "/hollywood": [() => import("@/components/media/SectionPage")],
  "/bollywood": [() => import("@/components/media/SectionPage")],
  "/tollywood": [() => import("@/components/media/SectionPage")],
  "/nollywood": [() => import("@/components/media/SectionPage")],
  "/cartoons": [() => import("@/components/media/SectionPage")],
  "/manga": [() => import("@/components/media/MangaPage")],
  "/mood": [() => import("@/components/media/MoodPage")],
  "/watchlist": [() => import("@/components/media/WatchlistPage")],
  "/search": [() => import("@/components/media/SearchPage")],
  "/policy": [() => import("@/components/layout/PolicyPage")],
  "/title": [() => import("@/components/media/TitleDetailPage")],
  "/watch": [() => import("@/components/player/WatchPage")],
};

function isTestMode(): boolean {
  try {
    return (import.meta.env as Record<string, unknown> | undefined)?.["MODE"] === "test";
  } catch {
    return false;
  }
}

/**
 * Warms the static Vite JS bundle for a lazy route on link hover/focus without
 * firing any TanStack Router loader or Cloudflare Worker `/_serverFn/*` request.
 */
export function preloadChunk(path: string, opts?: { force?: boolean }): boolean {
  if (typeof window === "undefined") return false;
  if (isTestMode() && !opts?.force) return false;
  const key = path.startsWith("/watch") ? "/watch" : path.startsWith("/title") ? "/title" : path;
  if (warmed.has(key)) return false;
  const loaders = CHUNK_LOADERS[key];
  if (!loaders) return false;
  warmed.add(key);
  for (const load of loaders) {
    void load().catch(() => {
      warmed.delete(key);
    });
  }
  return true;
}

export function clearPreloadedChunks(): void {
  warmed.clear();
}
