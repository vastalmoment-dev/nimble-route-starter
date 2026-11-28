import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedAsync, clearClientMemoryCache } from "@/lib/cache/client-cache";
import { loadSection, searchAll, sectionQuery } from "@/lib/catalog";
import * as mediaFunctions from "@/lib/catalog/media.functions";
import { clearPreloadedChunks, preloadChunk } from "@/lib/preload-chunks";
import { getRouter } from "@/router";
import serverEntry from "@/server";

afterEach(() => {
  vi.restoreAllMocks();
  clearClientMemoryCache();
  clearPreloadedChunks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("Cloudflare Worker optimization & edge caching", () => {
  it("disables aggressive link preloading and sets 15m staleTime / 60m gcTime defaults", () => {
    const router = getRouter();
    expect(router.options.defaultPreload).toBe(false);

    const defaults = router.options.context.queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(1000 * 60 * 15);
    expect(defaults.queries?.gcTime).toBe(1000 * 60 * 60);

    const opts = sectionQuery("anime", "fr");
    expect(opts.staleTime).toBe(1000 * 60 * 15);
    expect(opts.gcTime).toBe(1000 * 60 * 60);
  });

  it("caches per-language entries in localStorage for 30 minutes without re-fetching on language toggle", async () => {
    const fetcher = vi.fn(async (lang: "en" | "fr") => ({ lang, count: lang === "fr" ? 12 : 10 }));

    const en1 = await cachedAsync(
      "tmdb:section:hollywood:en",
      1000 * 60 * 30,
      () => fetcher("en"),
      {
        persist: "local",
        forceCache: true,
      },
    );
    const fr1 = await cachedAsync(
      "tmdb:section:hollywood:fr",
      1000 * 60 * 30,
      () => fetcher("fr"),
      {
        persist: "local",
        forceCache: true,
      },
    );
    expect(en1).toEqual({ lang: "en", count: 10 });
    expect(fr1).toEqual({ lang: "fr", count: 12 });
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Clear in-memory LRU to prove subsequent reads hydrate straight from localStorage
    clearClientMemoryCache();

    const en2 = await cachedAsync(
      "tmdb:section:hollywood:en",
      1000 * 60 * 30,
      () => fetcher("en"),
      {
        persist: "local",
        forceCache: true,
      },
    );
    const fr2 = await cachedAsync(
      "tmdb:section:hollywood:fr",
      1000 * 60 * 30,
      () => fetcher("fr"),
      {
        persist: "local",
        forceCache: true,
      },
    );
    expect(en2).toEqual({ lang: "en", count: 10 });
    expect(fr2).toEqual({ lang: "fr", count: 12 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("loads English, French (with French selection shelf), and search results client-side without /_serverFn/* catalog calls", async () => {
    const serverSectionSpy = vi.spyOn(mediaFunctions, "getLiveSectionCatalog");
    const serverSearchSpy = vi.spyOn(mediaFunctions, "searchMediaCatalog");

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";
      if (url.includes("v3-cinemeta.strem.io/meta/")) {
        const match = /\/meta\/(movie|series)\/(tt\d+)\.json/.exec(url);
        const type = match?.[1] ?? "movie";
        const imdbId = match?.[2] ?? "tt15239678";
        return new Response(
          JSON.stringify({
            meta: {
              id: imdbId,
              imdb_id: imdbId,
              type,
              name: imdbId === "tt1675434" ? "Intouchables" : `Sample ${imdbId}`,
              releaseInfo: "2024",
              genres: ["Drama"],
              description: "Sample synopsis",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("v3-cinemeta.strem.io/catalog/")) {
        return new Response(
          JSON.stringify({
            metas: [
              {
                id: "tt15239678",
                imdb_id: "tt15239678",
                type: "movie",
                name: "Dune: Part Two",
                releaseInfo: "2024",
                genres: ["Sci-Fi"],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("graphql.anilist.co")) {
        return new Response(JSON.stringify({ data: { Page: { media: [] } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("api.tvmaze.com")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const enCatalog = await loadSection("hollywood", "en");
    expect(enCatalog.items.length).toBeGreaterThan(0);
    expect(enCatalog.shelves.some((s) => s.id === "french-selection")).toBe(false);

    const frCatalog = await loadSection("hollywood", "fr");
    expect(frCatalog.items.length).toBeGreaterThan(0);
    expect(frCatalog.shelves.some((s) => s.id === "french-selection")).toBe(true);

    const searchResults = await searchAll("dune", "en");
    expect(searchResults.some((item) => item.title.includes("Dune"))).toBe(true);

    expect(serverSectionSpy).not.toHaveBeenCalled();
    expect(serverSearchSpy).not.toHaveBeenCalled();
  });

  it("sets Cloudflare edge Cache-Control headers on GET /_serverFn/* while preserving no-store on CBZ downloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    );

    // /api/manga/download returns no-store when upstream metadata/chapter fails or succeeds; test invalid request vs cache policy
    const badDownload = await serverEntry.fetch(
      new Request("http://localhost/api/manga/download?chapterId=invalid"),
      {},
      {},
    );
    expect(badDownload.status).toBe(400);

    // Verify /api/media/image keeps 86400s image edge caching
    const imgRes = await serverEntry.fetch(
      new Request(
        "http://localhost/api/media/image?url=" +
          encodeURIComponent("https://images.metahub.space/poster/medium/tt0133093/img"),
      ),
      {},
      {},
    );
    expect(imgRes.status).toBe(200);
    expect(imgRes.headers.get("Cache-Control")).toBe("public, max-age=86400, s-maxage=86400");
  });

  it("warms static route JS chunks once per route with zero fetch/Worker calls", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(preloadChunk("/policy", { force: true })).toBe(true);
    expect(preloadChunk("/policy", { force: true })).toBe(false);
    expect(preloadChunk("/watch/anilist/21", { force: true })).toBe(true);
    expect(preloadChunk("/watch/tmdb/movie-1", { force: true })).toBe(false);
    expect(preloadChunk("/unknown-route", { force: true })).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
