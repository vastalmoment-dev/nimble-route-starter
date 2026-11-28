import { useSyncExternalStore } from "react";
import type { LastWatchedEntry } from "@/lib/player/progress";
import type { AudioOption } from "@/lib/stream/resolver";

export type SkipIntroSeconds = 0 | 60 | 85 | 90;

export interface UserSettings {
  defaultAnimeAudio: AudioOption;
  defaultAnimeAudioUpdatedAt: number;
  autoPlayNext: boolean;
  autoShowSubtitles: boolean;
  downloadIncludeSubtitles: boolean;
  skipIntroSeconds: SkipIntroSeconds;
}

export const SETTINGS_STORAGE_KEY = "shadow:settings:v1";
export const AUTO_NEXT_STORAGE_KEY = "shadow:auto-next";

export const DEFAULT_USER_SETTINGS: UserSettings = {
  defaultAnimeAudio: "sub",
  defaultAnimeAudioUpdatedAt: 0,
  autoPlayNext: true,
  autoShowSubtitles: true,
  downloadIncludeSubtitles: false,
  skipIntroSeconds: 85,
};

const listeners = new Set<() => void>();
let cachedKey = "__uninitialized__";
let cachedSnapshot: UserSettings = DEFAULT_USER_SETTINGS;

function normalizeSkipSeconds(value: unknown): SkipIntroSeconds {
  return value === 0 || value === 60 || value === 85 || value === 90 ? value : 85;
}

function readFromStorage(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_USER_SETTINGS;
  try {
    const rawSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    const rawAutoNext = window.localStorage.getItem(AUTO_NEXT_STORAGE_KEY);
    const cacheSignature = `${rawSettings ?? ""}|${rawAutoNext ?? ""}`;
    if (cacheSignature === cachedKey) return cachedSnapshot;

    const parsed = rawSettings ? (JSON.parse(rawSettings) as Partial<UserSettings> | null) : null;

    const autoNext =
      rawAutoNext !== null
        ? rawAutoNext !== "false"
        : typeof parsed?.autoPlayNext === "boolean"
          ? parsed.autoPlayNext
          : DEFAULT_USER_SETTINGS.autoPlayNext;

    const next: UserSettings = {
      defaultAnimeAudio: parsed?.defaultAnimeAudio === "dub" ? "dub" : "sub",
      defaultAnimeAudioUpdatedAt:
        typeof parsed?.defaultAnimeAudioUpdatedAt === "number" &&
        Number.isFinite(parsed.defaultAnimeAudioUpdatedAt)
          ? parsed.defaultAnimeAudioUpdatedAt
          : 0,
      autoPlayNext: autoNext,
      autoShowSubtitles:
        typeof parsed?.autoShowSubtitles === "boolean"
          ? parsed.autoShowSubtitles
          : DEFAULT_USER_SETTINGS.autoShowSubtitles,
      downloadIncludeSubtitles:
        typeof parsed?.downloadIncludeSubtitles === "boolean"
          ? parsed.downloadIncludeSubtitles
          : DEFAULT_USER_SETTINGS.downloadIncludeSubtitles,
      skipIntroSeconds: normalizeSkipSeconds(parsed?.skipIntroSeconds),
    };

    cachedKey = cacheSignature;
    cachedSnapshot = next;
    return cachedSnapshot;
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

function writeToStorage(next: UserSettings) {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(next);
    const autoNextStr = String(next.autoPlayNext);
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, serialized);
    window.localStorage.setItem(AUTO_NEXT_STORAGE_KEY, autoNextStr);
    cachedKey = `${serialized}|${autoNextStr}`;
    cachedSnapshot = next;
  } catch {
    /* ignore storage quota / private mode */
  }
}

function emit() {
  listeners.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SETTINGS_STORAGE_KEY || e.key === AUTO_NEXT_STORAGE_KEY || e.key === null) {
      cachedKey = "__invalidated__";
      emit();
    }
  });
}

export const userSettings = {
  get(): UserSettings {
    return readFromStorage();
  },

  snapshot(): UserSettings {
    return readFromStorage();
  },

  update(patch: Partial<UserSettings>): UserSettings {
    const current = readFromStorage();
    const audioChanged =
      patch.defaultAnimeAudio !== undefined &&
      patch.defaultAnimeAudio !== current.defaultAnimeAudio;

    const next: UserSettings = {
      defaultAnimeAudio:
        patch.defaultAnimeAudio === "dub"
          ? "dub"
          : patch.defaultAnimeAudio === "sub"
            ? "sub"
            : current.defaultAnimeAudio,
      defaultAnimeAudioUpdatedAt:
        typeof patch.defaultAnimeAudioUpdatedAt === "number"
          ? patch.defaultAnimeAudioUpdatedAt
          : audioChanged
            ? Date.now()
            : current.defaultAnimeAudioUpdatedAt,
      autoPlayNext:
        typeof patch.autoPlayNext === "boolean" ? patch.autoPlayNext : current.autoPlayNext,
      autoShowSubtitles:
        typeof patch.autoShowSubtitles === "boolean"
          ? patch.autoShowSubtitles
          : current.autoShowSubtitles,
      downloadIncludeSubtitles:
        typeof patch.downloadIncludeSubtitles === "boolean"
          ? patch.downloadIncludeSubtitles
          : current.downloadIncludeSubtitles,
      skipIntroSeconds:
        patch.skipIntroSeconds !== undefined
          ? normalizeSkipSeconds(patch.skipIntroSeconds)
          : current.skipIntroSeconds,
    };

    writeToStorage(next);
    emit();
    return next;
  },

  reset(): UserSettings {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
        window.localStorage.setItem(AUTO_NEXT_STORAGE_KEY, "true");
      } catch {
        /* ignore */
      }
    }
    cachedKey = "__invalidated__";
    const fresh = readFromStorage();
    emit();
    return fresh;
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useUserSettings(): UserSettings {
  return useSyncExternalStore(
    userSettings.subscribe,
    userSettings.snapshot,
    () => DEFAULT_USER_SETTINGS,
  );
}

/**
 * Resolves which audio track (Sub/Dub) an anime title should open with:
 * 1) Explicit URL query (`?audio=sub|dub`) always wins.
 * 2) If user saved a per-show track more recently than changing the global default setting, use it.
 * 3) Otherwise use the user's global browser preference (`defaultAnimeAudio`).
 */
export function resolvePreferredAnimeAudio(params: {
  explicitAudio?: AudioOption | null | undefined;
  lastWatched?: LastWatchedEntry | null | undefined;
  settings?: UserSettings | undefined;
}): AudioOption {
  if (params.explicitAudio === "sub" || params.explicitAudio === "dub") {
    return params.explicitAudio;
  }
  const settings = params.settings ?? userSettings.get();
  if (
    params.lastWatched?.audio &&
    params.lastWatched.updatedAt >= settings.defaultAnimeAudioUpdatedAt
  ) {
    return params.lastWatched.audio;
  }
  return settings.defaultAnimeAudio;
}
