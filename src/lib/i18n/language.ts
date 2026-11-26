import { useSyncExternalStore } from "react";

export type SiteLanguage = "en" | "fr";

export const STORAGE_KEY = "shadow_lang";
export const LEGACY_STORAGE_KEY = "shadow:lang:v1";

const listeners = new Set<() => void>();

let cached: SiteLanguage | null = null;

export function detectInitialLanguage(): SiteLanguage {
  if (typeof window === "undefined") return "en";
  try {
    const primary = window.localStorage.getItem(STORAGE_KEY);
    if (primary === "fr" || primary === "en") return primary;
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === "fr" || legacy === "en") return legacy;
  } catch {
    /* ignore storage errors */
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
      if (navigator.language.toLowerCase().startsWith("fr")) return "fr";
    }
  } catch {
    /* ignore navigator access errors */
  }
  return "en";
}

function getSnapshot(): SiteLanguage {
  if (cached === null) {
    cached = detectInitialLanguage();
  }
  return cached;
}

function persistLanguage(next: SiteLanguage) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.localStorage.setItem(LEGACY_STORAGE_KEY, next);
  } catch {
    /* ignore storage quota */
  }
}

export const siteLanguage = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get(): SiteLanguage {
    return getSnapshot();
  },
  set(next: SiteLanguage) {
    const prev = getSnapshot();
    cached = next;
    persistLanguage(next);
    if (prev !== next) {
      listeners.forEach((l) => l());
    }
  },
  refreshFromEnvironment() {
    const detected = detectInitialLanguage();
    if (cached !== detected) {
      cached = detected;
      listeners.forEach((l) => l());
    }
    return detected;
  },
};

export function useSiteLanguage(): SiteLanguage {
  return useSyncExternalStore(siteLanguage.subscribe, getSnapshot, () => "en");
}
