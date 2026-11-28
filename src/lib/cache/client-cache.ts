const SESSION_PREFIX = "shadow:api-cache:v1:";
const LOCAL_PREFIX = "shadow:api-cache:v2:";
const MAX_MEMORY_ENTRIES = 80;
const MAX_LOCAL_ENTRIES = 24;

export type CachePersistence = "session" | "local";

export interface CachedAsyncOptions {
  persist?: CachePersistence;
  /** Allows unit tests to explicitly exercise persistent localStorage caching. */
  forceCache?: boolean;
}

interface CacheEntry<T> {
  exp: number;
  data: T;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function isTestMode(): boolean {
  try {
    return (import.meta.env as Record<string, unknown> | undefined)?.["MODE"] === "test";
  } catch {
    return false;
  }
}

function getStorage(persist: CachePersistence): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return persist === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function storagePrefix(persist: CachePersistence): string {
  return persist === "local" ? LOCAL_PREFIX : SESSION_PREFIX;
}

function pruneStorage(storage: Storage, prefix: string): void {
  try {
    const keys: { key: string; exp: number }[] = [];
    const now = Date.now();
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      let exp = 0;
      try {
        const parsed = JSON.parse(storage.getItem(k) ?? "") as { exp?: unknown };
        exp = typeof parsed.exp === "number" ? parsed.exp : 0;
      } catch {
        exp = 0;
      }
      if (exp <= now) {
        storage.removeItem(k);
      } else {
        keys.push({ key: k, exp });
      }
    }
    if (keys.length > MAX_LOCAL_ENTRIES) {
      keys.sort((a, b) => a.exp - b.exp);
      const excess = keys.length - Math.floor(MAX_LOCAL_ENTRIES * 0.75);
      for (let i = 0; i < excess; i++) {
        storage.removeItem(keys[i]!.key);
      }
    }
  } catch {
    /* ignore storage pruning errors */
  }
}

function readStored<T>(
  key: string,
  persist: CachePersistence,
): { data: T; exp: number } | undefined {
  const storage = getStorage(persist);
  if (!storage) return undefined;
  const fullKey = `${storagePrefix(persist)}${key}`;
  try {
    const raw = storage.getItem(fullKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed.exp !== "number" || Date.now() > parsed.exp) {
      storage.removeItem(fullKey);
      return undefined;
    }
    return { data: parsed.data, exp: parsed.exp };
  } catch {
    return undefined;
  }
}

function writeStored<T>(key: string, entry: CacheEntry<T>, persist: CachePersistence): void {
  const storage = getStorage(persist);
  if (!storage) return;
  const prefix = storagePrefix(persist);
  const fullKey = `${prefix}${key}`;
  const serialized = JSON.stringify(entry);
  try {
    storage.setItem(fullKey, serialized);
  } catch {
    // Quota exceeded: prune expired/oldest entries and retry once.
    pruneStorage(storage, prefix);
    try {
      storage.setItem(fullKey, serialized);
    } catch {
      /* storage unavailable or still full */
    }
  }
}

function setMemory<T>(key: string, entry: CacheEntry<T>): void {
  if (memoryCache.has(key)) memoryCache.delete(key);
  memoryCache.set(key, entry);
  if (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
}

export function clearClientMemoryCache(): void {
  memoryCache.clear();
}

/**
 * Deduplicates concurrent in-flight promises and caches resolved results in memory + browser storage
 * (`localStorage` or `sessionStorage`) for `ttlMs`. Skips TTL caching during Vitest runs unless
 * `forceCache` is explicitly enabled.
 */
export async function cachedAsync<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  options?: CachedAsyncOptions,
): Promise<T> {
  const persist: CachePersistence = options?.persist ?? "local";
  const bypassTtl = ttlMs <= 0 || (isTestMode() && !options?.forceCache);

  if (!bypassTtl) {
    const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (mem) {
      if (Date.now() <= mem.exp) return mem.data;
      memoryCache.delete(key);
    }

    const stored = readStored<T>(key, persist);
    if (stored !== undefined) {
      setMemory(key, { exp: stored.exp, data: stored.data });
      return stored.data;
    }
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const flight = fetcher()
    .then((data) => {
      if (!bypassTtl && data !== undefined && data !== null) {
        const entry: CacheEntry<T> = { exp: Date.now() + ttlMs, data };
        setMemory(key, entry);
        writeStored(key, entry, persist);
      }
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, flight);
  return flight;
}
