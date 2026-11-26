import { useSyncExternalStore } from "react";

export type SiteLanguage = "en" | "fr";

const STORAGE_KEY = "shadow:lang:v1";
const listeners = new Set<() => void>();

let cached: SiteLanguage | null = null;

function readStorage(): SiteLanguage {
  if (typeof window === "undefined") return "en";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "fr" ? "fr" : "en";
  } catch {
    return "en";
  }
}

function getSnapshot(): SiteLanguage {
  if (cached === null) cached = readStorage();
  return cached;
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
    if (getSnapshot() === next) return;
    cached = next;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore storage quota */
      }
    }
    listeners.forEach((l) => l());
  },
};

export function useSiteLanguage(): SiteLanguage {
  return useSyncExternalStore(siteLanguage.subscribe, getSnapshot, () => "en");
}
