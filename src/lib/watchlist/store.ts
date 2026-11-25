import { useSyncExternalStore } from "react";
import type { MediaItem } from "@/lib/catalog/types";

const STORAGE_KEY = "shadow:watchlist:v1";

export interface WatchlistEntry {
  item: MediaItem;
  savedAt: number;
}

let entries: WatchlistEntry[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function readStorage(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is WatchlistEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as WatchlistEntry).savedAt === "number" &&
        Boolean((entry as WatchlistEntry).item?.key) &&
        Boolean((entry as WatchlistEntry).item?.title) &&
        Boolean((entry as WatchlistEntry).item?.source) &&
        Boolean((entry as WatchlistEntry).item?.id),
    );
  } catch {
    return [];
  }
}

function writeStorage(next: WatchlistEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota/private-mode storage errors */
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  entries = readStorage();
}

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      entries = readStorage();
      hydrated = true;
      emit();
    }
  });
}

export const watchlist = {
  subscribe(fn: () => void) {
    ensureHydrated();
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  snapshot(): WatchlistEntry[] {
    ensureHydrated();
    return entries;
  },
  has(key: string): boolean {
    ensureHydrated();
    return entries.some((e) => e.item.key === key);
  },
  add(item: MediaItem) {
    ensureHydrated();
    if (entries.some((e) => e.item.key === item.key)) return;
    entries = [{ item, savedAt: Date.now() }, ...entries];
    writeStorage(entries);
    emit();
  },
  remove(key: string) {
    ensureHydrated();
    const next = entries.filter((e) => e.item.key !== key);
    if (next.length === entries.length) return;
    entries = next;
    writeStorage(entries);
    emit();
  },
  toggle(item: MediaItem): boolean {
    ensureHydrated();
    if (entries.some((e) => e.item.key === item.key)) {
      this.remove(item.key);
      return false;
    }
    this.add(item);
    return true;
  },
  clear() {
    ensureHydrated();
    entries = [];
    writeStorage(entries);
    emit();
  },
};

const EMPTY: WatchlistEntry[] = [];

export function useWatchlist(): WatchlistEntry[] {
  return useSyncExternalStore(watchlist.subscribe, watchlist.snapshot, () => EMPTY);
}

export function useIsInWatchlist(key: string | undefined): boolean {
  const list = useWatchlist();
  if (!key) return false;
  return list.some((e) => e.item.key === key);
}
