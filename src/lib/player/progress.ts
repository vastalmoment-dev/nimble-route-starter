import type { Source } from "@/lib/catalog/types";
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

const PROGRESS_KEY = "shadow:progress:v1";
const LAST_WATCHED_KEY = "shadow:last-watched:v1";
const MAX_ENTRIES = 120;

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

export const playbackProgress = {
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
  }) {
    const season = params.season ?? 1;
    const episode = params.episode ?? 1;
    if (!Number.isFinite(params.currentTime) || params.currentTime < 0) return;
    const now = Date.now();
    const map = readMap<PlaybackProgressEntry>(PROGRESS_KEY);
    map[episodeProgressKey(params.source, params.id, season, episode)] = {
      currentTime: params.currentTime,
      duration: Number.isFinite(params.duration ?? 0) ? (params.duration ?? 0) : 0,
      season,
      episode,
      ...(params.audio ? { audio: params.audio } : {}),
      updatedAt: now,
    };
    writeMap(PROGRESS_KEY, map);

    const lastMap = readMap<LastWatchedEntry>(LAST_WATCHED_KEY);
    lastMap[showKey(params.source, params.id)] = {
      season,
      episode,
      ...(params.audio ? { audio: params.audio } : {}),
      updatedAt: now,
    };
    writeMap(LAST_WATCHED_KEY, lastMap);
  },

  getLastWatched(source: Source | string, id: string): LastWatchedEntry | null {
    const map = readMap<LastWatchedEntry>(LAST_WATCHED_KEY);
    return map[showKey(source, id)] ?? null;
  },
};
