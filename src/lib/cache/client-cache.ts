const CACHE_PREFIX = "shadow:api-cache:v1:";
const MAX_MEMORY_ENTRIES = 120;

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

function readSession<T>(key: string): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed.exp !== "number" || Date.now() > parsed.exp) {
      window.sessionStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
}

function writeSession<T>(key: string, entry: CacheEntry<T>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    /* sessionStorage unavailable or quota exceeded */
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

/**
 * Deduplicates concurrent in-flight promises and caches resolved results in memory + sessionStorage
 * for `ttlMs`. Skips persistent TTL caching during Vitest runs so mocked fetches stay isolated.
 */
export async function cachedAsync<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const bypassTtl = ttlMs <= 0 || isTestMode();

  if (!bypassTtl) {
    const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (mem) {
      if (Date.now() <= mem.exp) return mem.data;
      memoryCache.delete(key);
    }

    const stored = readSession<T>(key);
    if (stored !== undefined) {
      setMemory(key, { exp: Date.now() + ttlMs, data: stored });
      return stored;
    }
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const flight = fetcher()
    .then((data) => {
      if (!bypassTtl && data !== undefined && data !== null) {
        const entry: CacheEntry<T> = { exp: Date.now() + ttlMs, data };
        setMemory(key, entry);
        writeSession(key, entry);
      }
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, flight);
  return flight;
}
