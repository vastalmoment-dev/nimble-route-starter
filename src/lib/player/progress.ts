import { useSyncExternalStore } from "react";
import { isAnimeItem } from "@/lib/catalog/anime-bridge";
import type { MediaItem, Source } from "@/lib/catalog/types";
import type { AudioOption } from "@/lib/stream/resolver";

export interface PlaybackProgressEntry {
  currentTime: number;
  duration: number;
  season: number;
  episode: number;
  audio?: AudioOption | undefined;
  updatedAt: number;
}

export interface LastWatchedEntry {
  season: number;
  episode: number;
  audio?: AudioOption | undefined;
  updatedAt: number;
}

export interface ContinueWatchingEntry {
  item: MediaItem;
  season: number;
  episode: number;
  currentTime: number;
  duration: number;
  audio?: AudioOption | undefined;
  updatedAt: number;
}

const PROGRESS_KEY = "shadow:progress:v1";
const LAST_WATCHED_KEY = "shadow:last-watched:v1";
const CONTINUE_WATCHING_KEY = "shadow:continue-watching:v1";
const MAX_ENTRIES = 120;
const MAX_CONTINUE = 40;

const listeners = new Set<() => void>();
let continueCacheRaw: string | null = null;
let continueCacheList: ContinueWatchingEntry[] = [];
let lastCacheRaw: string | null = null;
let lastCacheMap: Record<string, LastWatchedEntry> = {};
let progressCacheRaw: string | null = null;
let progressCacheMap: Record<string, PlaybackProgressEntry> = {};

function emit() {
  listeners.forEach((fn) => fn());
}

export function episodeProgressKey(
  source: Source | string,
  id: string,
  season = 1,
  episode = 1,
): string {
  return `${source}:${id}:s${season}:e${episode}`;
}

export function showKey(source: Source | string, id: string): string {
  return `${source}:${id}`;
}

function readMap<T>(storageKey: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function writeMap<T extends { updatedAt: number }>(storageKey: string, map: Record<string, T>) {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(map);
    if (entries.length > MAX_ENTRIES) {
      entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
      map = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
    }
    window.localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    /* ignore storage quota */
  }
}

function readContinueList(): ContinueWatchingEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CONTINUE_WATCHING_KEY);
    if (raw === continueCacheRaw) return continueCacheList;
    continueCacheRaw = raw;
    if (!raw) {
      continueCacheList = [];
      return continueCacheList;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      continueCacheList = [];
      return continueCacheList;
    }
    continueCacheList = parsed.filter(
      (entry): entry is ContinueWatchingEntry =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as ContinueWatchingEntry).updatedAt === "number" &&
        Boolean((entry as ContinueWatchingEntry).item?.id) &&
        Boolean((entry as ContinueWatchingEntry).item?.source) &&
        Boolean((entry as ContinueWatchingEntry).item?.title),
    );
    return continueCacheList;
  } catch {
    continueCacheList = [];
    return continueCacheList;
  }
}

function writeContinueList(list: ContinueWatchingEntry[]) {
  if (typeof window === "undefined") return;
  const trimmed = list.slice(0, MAX_CONTINUE);
  try {
    const serialized = JSON.stringify(trimmed);
    window.localStorage.setItem(CONTINUE_WATCHING_KEY, serialized);
    continueCacheRaw = serialized;
    continueCacheList = trimmed;
  } catch {
    /* ignore storage quota */
  }
}

function readProgressMapCached(): Record<string, PlaybackProgressEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (raw === progressCacheRaw) return progressCacheMap;
    progressCacheRaw = raw;
    progressCacheMap = raw
      ? ((JSON.parse(raw) as Record<string, PlaybackProgressEntry>) ?? {})
      : {};
    return progressCacheMap;
  } catch {
    return {};
  }
}

function readLastMapCached(): Record<string, LastWatchedEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LAST_WATCHED_KEY);
    if (raw === lastCacheRaw) return lastCacheMap;
    lastCacheRaw = raw;
    lastCacheMap = raw ? ((JSON.parse(raw) as Record<string, LastWatchedEntry>) ?? {}) : {};
    return lastCacheMap;
  } catch {
    return {};
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (
      e.key === null ||
      e.key === PROGRESS_KEY ||
      e.key === LAST_WATCHED_KEY ||
      e.key === CONTINUE_WATCHING_KEY
    ) {
      progressCacheRaw = null;
      lastCacheRaw = null;
      continueCacheRaw = null;
      emit();
    }
  });
}

export const playbackProgress = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getContinueWatchingSnapshot(): ContinueWatchingEntry[] {
    return readContinueList();
  },

  getProgressMapSnapshot(): Record<string, PlaybackProgressEntry> {
    return readProgressMapCached();
  },

  getLastMapSnapshot(): Record<string, LastWatchedEntry> {
    return readLastMapCached();
  },

  get(source: Source | string, id: string, season = 1, episode = 1): PlaybackProgressEntry | null {
    const map = readMap<PlaybackProgressEntry>(PROGRESS_KEY);
    const entry = map[episodeProgressKey(source, id, season, episode)];
    if (!entry || !Number.isFinite(entry.currentTime) || entry.currentTime < 1) return null;
    // If the user finished >=97% of the video, start fresh on next visit rather than right at credits.
    if (entry.duration > 30 && entry.currentTime / entry.duration >= 0.97) return null;
    return entry;
  },

  save(params: {
    source: Source | string;
    id: string;
    season?: number | undefined;
    episode?: number | undefined;
    currentTime: number;
    duration?: number | undefined;
    audio?: AudioOption | undefined;
    item?: MediaItem | undefined;
  }) {
    const season = params.season ?? 1;
    const episode = params.episode ?? 1;
    if (!Number.isFinite(params.currentTime) || params.currentTime < 0) return;
    const now = Date.now();
    const epKey = episodeProgressKey(params.source, params.id, season, episode);
    const map = readMap<PlaybackProgressEntry>(PROGRESS_KEY);
    const prevEp = map[epKey];

    // Preserve a meaningful previously saved timestamp when opening an already-started episode
    // before the player reports a real updated currentTime (e.g. initial mount or embed mode).
    const effectiveTime =
      params.currentTime < 1 && prevEp && prevEp.currentTime >= 1
        ? prevEp.currentTime
        : params.currentTime;
    const effectiveDuration =
      params.duration && Number.isFinite(params.duration) && params.duration > 0
        ? params.duration
        : (prevEp?.duration ?? 0);

    map[epKey] = {
      currentTime: effectiveTime,
      duration: effectiveDuration,
      season,
      episode,
      ...(params.audio ? { audio: params.audio } : {}),
      updatedAt: now,
    };
    writeMap(PROGRESS_KEY, map);
    progressCacheRaw = null;

    const lastMap = readMap<LastWatchedEntry>(LAST_WATCHED_KEY);
    lastMap[showKey(params.source, params.id)] = {
      season,
      episode,
      ...(params.audio ? { audio: params.audio } : {}),
      updatedAt: now,
    };
    writeMap(LAST_WATCHED_KEY, lastMap);
    lastCacheRaw = null;

    if (params.item?.id && params.item.source && params.item.title) {
      const targetKey = showKey(params.source, params.id);
      const currentList = readContinueList().filter(
        (e) => showKey(e.item.source, e.item.id) !== targetKey,
      );
      const isFinishedMovie =
        params.item.mediaType === "movie" &&
        effectiveDuration > 30 &&
        effectiveTime / effectiveDuration >= 0.97;
      if (!isFinishedMovie) {
        currentList.unshift({
          item: {
            ...params.item,
            key: params.item.key || targetKey,
          },
          season,
          episode,
          currentTime: effectiveTime,
          duration: effectiveDuration,
          ...(params.audio ? { audio: params.audio } : {}),
          updatedAt: now,
        });
      }
      writeContinueList(currentList);
    }

    emit();
  },

  getLastWatched(source: Source | string, id: string): LastWatchedEntry | null {
    const map = readMap<LastWatchedEntry>(LAST_WATCHED_KEY);
    return map[showKey(source, id)] ?? null;
  },

  removeShowHistory(source: Source | string, id: string) {
    const targetKey = showKey(source, id);
    const epPrefix = `${targetKey}:`;

    const nextContinue = readContinueList().filter(
      (e) => showKey(e.item.source, e.item.id) !== targetKey,
    );
    writeContinueList(nextContinue);

    const lastMap = readMap<LastWatchedEntry>(LAST_WATCHED_KEY);
    if (targetKey in lastMap) {
      delete lastMap[targetKey];
      writeMap(LAST_WATCHED_KEY, lastMap);
      lastCacheRaw = null;
    }

    const progMap = readMap<PlaybackProgressEntry>(PROGRESS_KEY);
    let progChanged = false;
    for (const k of Object.keys(progMap)) {
      if (k.startsWith(epPrefix)) {
        delete progMap[k];
        progChanged = true;
      }
    }
    if (progChanged) {
      writeMap(PROGRESS_KEY, progMap);
      progressCacheRaw = null;
    }

    emit();
  },

  removeContinueWatching(source: Source | string, id: string) {
    this.removeShowHistory(source, id);
  },

  clearHistory(scope: "all" | "anime" | "other" = "all") {
    if (typeof window === "undefined") return;
    if (scope === "all") {
      try {
        window.localStorage.removeItem(PROGRESS_KEY);
        window.localStorage.removeItem(LAST_WATCHED_KEY);
        window.localStorage.removeItem(CONTINUE_WATCHING_KEY);
      } catch {
        /* ignore */
      }
      progressCacheRaw = null;
      progressCacheMap = {};
      lastCacheRaw = null;
      lastCacheMap = {};
      continueCacheRaw = null;
      continueCacheList = [];
      emit();
      return;
    }

    const currentContinue = readContinueList();
    const removedShowKeys = new Set<string>();
    const keptContinue: ContinueWatchingEntry[] = [];

    for (const entry of currentContinue) {
      const anime = isAnimeItem(entry.item);
      const shouldRemove = scope === "anime" ? anime : !anime;
      if (shouldRemove) {
        removedShowKeys.add(showKey(entry.item.source, entry.item.id));
      } else {
        keptContinue.push(entry);
      }
    }

    const lastMap = readMap<LastWatchedEntry>(LAST_WATCHED_KEY);
    for (const key of Object.keys(lastMap)) {
      const isAnilist = key.startsWith("anilist:");
      if (
        removedShowKeys.has(key) ||
        (scope === "anime" && isAnilist) ||
        (scope === "other" && !isAnilist && !removedShowKeys.has(key))
      ) {
        if (scope === "anime" ? removedShowKeys.has(key) || isAnilist : removedShowKeys.has(key)) {
          delete lastMap[key];
          removedShowKeys.add(key);
        }
      }
    }

    const progMap = readMap<PlaybackProgressEntry>(PROGRESS_KEY);
    for (const epKey of Object.keys(progMap)) {
      const ownerShowKey = epKey.split(":s")[0] ?? "";
      if (removedShowKeys.has(ownerShowKey)) {
        delete progMap[epKey];
      }
    }

    writeContinueList(keptContinue);
    writeMap(LAST_WATCHED_KEY, lastMap);
    lastCacheRaw = null;
    writeMap(PROGRESS_KEY, progMap);
    progressCacheRaw = null;
    emit();
  },
};

const EMPTY_CONTINUE: ContinueWatchingEntry[] = [];
const EMPTY_LAST_MAP: Record<string, LastWatchedEntry> = {};
const EMPTY_PROGRESS_MAP: Record<string, PlaybackProgressEntry> = {};

export function useContinueWatching(): ContinueWatchingEntry[] {
  return useSyncExternalStore(
    playbackProgress.subscribe,
    playbackProgress.getContinueWatchingSnapshot,
    () => EMPTY_CONTINUE,
  );
}

export function useShowProgress(source: Source | string, id: string) {
  const lastMap = useSyncExternalStore(
    playbackProgress.subscribe,
    playbackProgress.getLastMapSnapshot,
    () => EMPTY_LAST_MAP,
  );
  const progMap = useSyncExternalStore(
    playbackProgress.subscribe,
    playbackProgress.getProgressMapSnapshot,
    () => EMPTY_PROGRESS_MAP,
  );
  const last = lastMap[showKey(source, id)] ?? null;
  if (!last) return { last: null, progressPct: null as number | null };
  const entry = progMap[episodeProgressKey(source, id, last.season, last.episode)];
  const progressPct =
    entry && entry.duration > 30 && entry.currentTime > 1
      ? Math.min(100, Math.max(4, Math.round((entry.currentTime / entry.duration) * 100)))
      : null;
  return { last, progressPct };
}
