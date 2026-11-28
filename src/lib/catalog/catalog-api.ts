import { computeHomeCatalog, computeSearchCatalog, computeSectionCatalog } from "./index";
import type { SectionId } from "./types";

const VALID_SECTIONS = new Set<SectionId>([
  "anime",
  "k-dramas",
  "hollywood",
  "bollywood",
  "tollywood",
  "nollywood",
  "cartoons",
]);

const SERVER_CATALOG_FRESH_MS = 90_000;
const SERVER_CATALOG_TTL_MS = 1000 * 60 * 10;
const CATALOG_EDGE_CACHE_CONTROL = "public, max-age=180, s-maxage=600, stale-while-revalidate=3600";

const serverResponseCache = new Map<string, { ts: number; exp: number; body: string }>();
const serverInflight = new Map<string, Promise<string>>();

function startCatalogRefresh(cacheKey: string, producer: () => Promise<unknown>): Promise<string> {
  const active = serverInflight.get(cacheKey);
  if (active) return active;

  const task = producer()
    .then((data) => {
      const body = JSON.stringify(data);
      const now = Date.now();
      if (serverResponseCache.size > 60) {
        const oldest = serverResponseCache.keys().next().value;
        if (oldest !== undefined) serverResponseCache.delete(oldest);
      }
      serverResponseCache.set(cacheKey, {
        ts: now,
        exp: now + SERVER_CATALOG_TTL_MS,
        body,
      });
      return body;
    })
    .finally(() => {
      serverInflight.delete(cacheKey);
    });

  serverInflight.set(cacheKey, task);
  return task;
}

async function getCachedJsonBody(
  cacheKey: string,
  producer: () => Promise<unknown>,
): Promise<string> {
  const now = Date.now();
  const hit = serverResponseCache.get(cacheKey);
  if (hit && now <= hit.exp) {
    if (now - hit.ts >= SERVER_CATALOG_FRESH_MS) {
      void startCatalogRefresh(cacheKey, producer).catch(() => {
        /* keep stale entry until next request if upstream transiently fails */
      });
    }
    return hit.body;
  }

  return startCatalogRefresh(cacheKey, producer);
}

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": CATALOG_EDGE_CACHE_CONTROL,
    },
  });
}

export function clearServerCatalogCache(): void {
  serverResponseCache.clear();
}

export async function handleCatalogApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/catalog/")) return null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const langParam = url.searchParams.get("lang");
  const lang: "en" | "fr" = langParam === "fr" ? "fr" : "en";

  try {
    if (url.pathname === "/api/catalog/home") {
      const body = await getCachedJsonBody(`home:${lang}`, () =>
        computeHomeCatalog(lang, { forceRefresh: true }),
      );
      return jsonResponse(request.method === "HEAD" ? "" : body);
    }

    if (url.pathname === "/api/catalog/section") {
      const section = url.searchParams.get("section") as SectionId | null;
      if (!section || !VALID_SECTIONS.has(section)) {
        return new Response(JSON.stringify({ error: "Invalid section" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      const body = await getCachedJsonBody(`section:${section}:${lang}`, () =>
        computeSectionCatalog(section, lang, { forceRefresh: true }),
      );
      return jsonResponse(request.method === "HEAD" ? "" : body);
    }

    if (url.pathname === "/api/catalog/search") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length < 2) {
        return jsonResponse("[]");
      }
      const body = await getCachedJsonBody(`search:${lang}:${q.toLowerCase()}`, () =>
        computeSearchCatalog(q, lang),
      );
      return jsonResponse(request.method === "HEAD" ? "" : body);
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Catalog API aggregation failed", error);
    return new Response(JSON.stringify({ error: "Catalog temporarily unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
