import { useSyncExternalStore } from "react";
import type { Source } from "@/lib/catalog/types";
import type { SiteLanguage } from "@/lib/i18n/language";
import type { AudioOption } from "@/lib/stream/resolver";

const DB_NAME = "shadow-offline-library";
const DB_VERSION = 1;
const STORE_NAME = "episodes";

export interface OfflineMediaEntry {
  id: string;
  source: Source;
  itemId: string;
  season: number;
  episode: number;
  audio: AudioOption;
  lang: SiteLanguage;
  title: string;
  poster?: string | null;
  mediaType?: "tv" | "movie" | undefined;
  filename: string;
  ext: string;
  mimeType: string;
  byteSize: number;
  savedAt: number;
  videoBlob: Blob;
  subtitleVtt?: string | null;
}

export type OfflineMediaSummary = Omit<OfflineMediaEntry, "videoBlob" | "subtitleVtt">;

function toSummary(entry: OfflineMediaEntry): OfflineMediaSummary {
  return {
    id: entry.id,
    source: entry.source,
    itemId: entry.itemId,
    season: entry.season,
    episode: entry.episode,
    audio: entry.audio,
    lang: entry.lang,
    title: entry.title,
    poster: entry.poster ?? null,
    mediaType: entry.mediaType,
    filename: entry.filename,
    ext: entry.ext,
    mimeType: entry.mimeType,
    byteSize: entry.byteSize,
    savedAt: entry.savedAt,
  };
}

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let cachedList: OfflineMediaSummary[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

async function refreshList() {
  const db = await openDb();
  if (!db) {
    hydrated = true;
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? (req.result as OfflineMediaEntry[]) : [];
        cachedList = rows.map(toSummary).sort((a, b) => b.savedAt - a.savedAt);
        hydrated = true;
        emit();
        resolve();
      };
      req.onerror = () => {
        hydrated = true;
        resolve();
      };
    } catch {
      hydrated = true;
      resolve();
    }
  });
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const offlineLibrary = {
  buildId(params: {
    source: Source;
    id: string;
    season: number;
    episode: number;
    audio: AudioOption;
    lang: SiteLanguage;
  }): string {
    return `${params.source}:${params.id}:s${params.season}:e${params.episode}:${params.audio}:${params.lang}`;
  },

  async save(entry: OfflineMediaEntry): Promise<boolean> {
    const db = await openDb();
    if (!db) return false;
    const ok = await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(entry);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
    if (ok) await refreshList();
    return ok;
  },

  async get(id: string): Promise<OfflineMediaEntry | null> {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve((req.result as OfflineMediaEntry | undefined) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  },

  async list(): Promise<OfflineMediaSummary[]> {
    if (!hydrated) await refreshList();
    return cachedList;
  },

  async remove(id: string): Promise<void> {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    await refreshList();
  },

  async clear(): Promise<void> {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    cachedList = [];
    emit();
  },

  async exportToDevice(id: string): Promise<boolean> {
    const entry = await offlineLibrary.get(id);
    if (!entry) return false;
    triggerBlobDownload(entry.videoBlob, `${entry.filename}.${entry.ext}`);
    if (entry.subtitleVtt) {
      triggerBlobDownload(
        new Blob([entry.subtitleVtt], { type: "text/vtt; charset=utf-8" }),
        `${entry.filename}.vtt`,
      );
    }
    return true;
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    if (!hydrated && hasIndexedDb()) {
      void refreshList();
    }
    return () => listeners.delete(fn);
  },

  snapshot: () => cachedList,
};

const EMPTY_OFFLINE: OfflineMediaSummary[] = [];

export function useOfflineLibrary(): OfflineMediaSummary[] {
  return useSyncExternalStore(
    offlineLibrary.subscribe,
    offlineLibrary.snapshot,
    () => EMPTY_OFFLINE,
  );
}
