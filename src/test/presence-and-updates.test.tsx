import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromoBanner } from "@/components/ads/PromoBanner";
import { MediaCard } from "@/components/media/MediaCard";
import { MediaModalProvider } from "@/components/media/MediaModalContext";
import VideoPlayer, {
  PRIMARY_SERVER_TIMEOUT_MS,
  pickPreferredAudioTrack,
  raceSecondarySources,
} from "@/components/player/VideoPlayer";
import { EMBED_FAILOVER_TIMEOUT_MS } from "@/components/player/WatchPage";
import { clearServerCatalogCache, handleCatalogApiRequest } from "@/lib/catalog/catalog-api";
import { buildCartoonsCatalog, computeLiveSectionCatalog } from "@/lib/catalog/live-catalog";
import { clearClientMemoryCache } from "@/lib/cache/client-cache";
import { PROMO_BANNERS } from "@/lib/promo/banners";
import {
  clearPresenceStore,
  getWatcherCount,
  handlePresenceRequest,
  leaveWatcher,
  touchWatcher,
} from "@/lib/presence/presence-store";
import { buildAnimeEmbedFallbacks, resolveAnimeStream } from "@/lib/stream/anilast.functions";

describe("Server-authoritative live watcher presence (/api/presence)", () => {
  beforeEach(() => {
    clearPresenceStore();
  });

  afterEach(() => {
    clearPresenceStore();
  });

  it("tracks active viewers per showKey, deduplicates heartbeats, handles leave, and expires stale sessions", () => {
    const t0 = 1_000_000;
    expect(getWatcherCount("cinemeta:movie-tt15239678", t0)).toBe(0);

    expect(touchWatcher("cinemeta:movie-tt15239678", "sess-1", t0)).toBe(1);
    expect(touchWatcher("cinemeta:movie-tt15239678", "sess-1", t0 + 5_000)).toBe(1);
    expect(touchWatcher("cinemeta:movie-tt15239678", "sess-2", t0 + 10_000)).toBe(2);
    expect(touchWatcher("anilist:16498", "sess-3", t0 + 10_000)).toBe(1);

    expect(leaveWatcher("cinemeta:movie-tt15239678", "sess-1", t0 + 11_000)).toBe(1);
    // sess-2 expires after 45s TTL
    expect(getWatcherCount("cinemeta:movie-tt15239678", t0 + 60_000)).toBe(0);
  });

  it("handles POST heartbeat, GET count, and DELETE leave with Cache-Control: no-store", async () => {
    const postRes = await handlePresenceRequest(
      new Request("http://localhost:3000/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showKey: "anilist:151807",
          sessionId: "viewer-abc-1234",
          action: "heartbeat",
        }),
      }),
    );
    expect(postRes?.status).toBe(200);
    expect(postRes?.headers.get("cache-control")).toBe("no-store");
    expect(await postRes?.json()).toEqual({
      ok: true,
      showKey: "anilist:151807",
      count: 1,
    });

    const getRes = await handlePresenceRequest(
      new Request("http://localhost:3000/api/presence?showKey=anilist%3A151807"),
    );
    expect(getRes?.status).toBe(200);
    expect(await getRes?.json()).toEqual({
      ok: true,
      showKey: "anilist:151807",
      count: 1,
    });

    const delRes = await handlePresenceRequest(
      new Request(
        "http://localhost:3000/api/presence?showKey=anilist%3A151807&sessionId=viewer-abc-1234",
        {
          method: "DELETE",
        },
      ),
    );
    expect(delRes?.status).toBe(200);
    expect(await delRes?.json()).toEqual({
      ok: true,
      showKey: "anilist:151807",
      count: 0,
    });
  });
});

describe("16-second primary server grace timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits at least 16 seconds on primary server before switching to backup", () => {
    expect(PRIMARY_SERVER_TIMEOUT_MS).toBe(16_000);
    expect(EMBED_FAILOVER_TIMEOUT_MS).toBe(16_000);

    const { container } = render(
      <VideoPlayer
        stream={{
          url: "https://primary.example.com/slow.mp4",
          type: "mp4",
          provider: "SHADOW Stream",
          isDemo: false,
          sources: [
            { url: "https://primary.example.com/slow.mp4", type: "mp4", label: "Server 1" },
            { url: "https://backup.example.com/fast.mp4", type: "mp4", label: "Server 2" },
          ],
        }}
        title="16s Timeout Test"
        onBack={() => {}}
      />,
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.src).toContain("primary.example.com");

    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(video.src).toContain("primary.example.com");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(video.src).toContain("backup.example.com");
  });
});

describe("Anime Dub audio prioritization & multi-audio HLS selection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects English/French/Japanese audio track accurately inside multi-audio manifests", () => {
    const dualAudio = [
      { id: 0, name: "Japanese (Original)", lang: "jpn" },
      { id: 1, name: "English Dub", lang: "eng" },
    ];
    expect(pickPreferredAudioTrack(dualAudio, "en")).toBe(1);
    expect(pickPreferredAudioTrack(dualAudio, "ja")).toBe(0);

    const enFrDual = [
      { id: 0, name: "French VF", lang: "fra" },
      { id: 1, name: "English", lang: "en" },
    ];
    expect(pickPreferredAudioTrack(enFrDual, "en")).toBe(1);
    expect(pickPreferredAudioTrack(enFrDual, "fr")).toBe(0);
  });

  it("prioritizes dedicated /dub embeds first and rejects false sub-only responses in dub mode", async () => {
    const dubEmbeds = buildAnimeEmbedFallbacks({
      anilistId: "21273",
      malId: 34572,
      episode: 20,
      audio: "dub",
    });
    expect(dubEmbeds[0]?.url).toBe("https://megaplay.buzz/stream/mal/34572/20/dub");
    expect(dubEmbeds[1]?.url).toBe("https://vidsrc.su/embed/anime/21273/20/dub");

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("graphql.anilist.co")) {
        return new Response(
          JSON.stringify({
            data: {
              Media: {
                idMal: 34572,
                format: "TV",
                title: {
                  english: "Black Clover",
                  romaji: "Black Clover",
                  native: "ブラッククローバー",
                },
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("api.ani.zip/mappings")) {
        return new Response(JSON.stringify({ mappings: { imdb_id: "tt7441658", mal_id: 34572 } }), {
          status: 200,
        });
      }
      if (url.includes("/api/anime/stream/") && url.includes("type=dub")) {
        // Simulate upstream returning a sub-only manifest when dub was requested
        return new Response(
          JSON.stringify({
            url: "/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fsub%2Fmaster.m3u8",
            type: "hls",
            audio: "sub",
            subtitles: [{ url: "https://subs.example.com/en.vtt", lang: "eng", label: "English" }],
          }),
          { status: 200 },
        );
      }
      if (url.includes("megaplay.buzz") || url.includes("vidsrc.su")) {
        return new Response(
          `<html><title>Dub Player</title><body>${"x".repeat(200)}</body></html>`,
          {
            status: 200,
          },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const res = await resolveAnimeStream({
      anilistId: "21273",
      malId: 34572,
      episode: 20,
      audio: "dub",
      lang: "en",
      title: "Black Clover",
    });
    expect(res.ok).toBe(false);
    expect(res.streamUrl).toBeNull();
    expect(res.embedFallbacks?.[0]?.url).toContain("/dub");
  });
});

describe("Miraculous English vs French catalog separation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps French cartoons and French Miraculous strictly in French mode and English Miraculous in English mode", async () => {
    window.localStorage.clear();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/meta/series/tt2580046.json")) {
        return new Response(
          JSON.stringify({
            meta: {
              id: "tt2580046",
              type: "series",
              name: "Miraculous: Tales of Ladybug & Cat Noir",
              language: "French",
              country: "France, South Korea",
              genres: ["Animation", "Action"],
              year: "2015",
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/meta/movie/tt10364034.json")) {
        return new Response(
          JSON.stringify({
            meta: {
              id: "tt10364034",
              type: "movie",
              name: "Miraculous: Ladybug & Cat Noir, the Movie",
              language: "French",
              country: "France",
              genres: ["Animation", "Family"],
              year: "2023",
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/meta/series/tt1807824.json")) {
        return new Response(
          JSON.stringify({
            meta: {
              id: "tt1807824",
              type: "series",
              name: "Wakfu",
              language: "French",
              country: "France",
              genres: ["Animation", "Fantasy"],
              year: "2008",
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ metas: [] }), { status: 200 });
    });

    const enCatalog = await buildCartoonsCatalog("en");
    expect(enCatalog.shelves.some((s) => s.id === "french-selection")).toBe(false);
    expect(enCatalog.items.some((i) => i.imdbId === "tt1807824")).toBe(false);
    const enMiraculous = enCatalog.items.find((i) => i.imdbId === "tt2580046");
    expect(enMiraculous?.title).toBe("Miraculous: Tales of Ladybug & Cat Noir");
    expect(enMiraculous?.language).toBe("English");

    const frCatalog = await buildCartoonsCatalog("fr");
    const frShelf = frCatalog.shelves.find((s) => s.id === "french-selection");
    expect(frShelf).toBeTruthy();
    expect(frShelf?.items.some((i) => i.imdbId === "tt1807824")).toBe(true);
    const frMiraculous = frShelf?.items.find((i) => i.imdbId === "tt2580046");
    expect(frMiraculous?.title).toBe("Miraculous : Les Aventures de Ladybug et Chat Noir");
    expect(frMiraculous?.language).toBe("Français");
  });
});

describe("WatchPage embed landscape expand + live watchers badge + Movie downloads + Banner/Popup cleanup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Expand landscape button on embed players and live viewer badge on WatchPage", async () => {
    const { RouterProvider, createMemoryHistory, createRouter } =
      await import("@tanstack/react-router");
    const { routeTree } = await import("@/routeTree.gen");

    const lockMock = vi.fn().mockResolvedValue(undefined);
    const unlockMock = vi.fn();
    Object.defineProperty(window.screen, "orientation", {
      configurable: true,
      value: { lock: lockMock, unlock: unlockMock },
    });

    let fsEl: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fsEl,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: vi.fn().mockImplementation(async () => {
        fsEl = null;
        document.dispatchEvent(new Event("fullscreenchange"));
      }),
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";
      if (url.includes("/api/presence")) {
        return new Response(JSON.stringify({ ok: true, count: 14 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("cinemeta")) {
        return new Response(
          JSON.stringify({
            meta: {
              id: "tt15239678",
              type: "movie",
              name: "Dune: Part Two",
              genres: ["Sci-Fi"],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({
        initialEntries: ["/watch/cinemeta/movie-tt15239678"],
      }),
    });

    await router.load();
    render(<RouterProvider router={router} />);

    // Live watching count badge shows live count returned by server presence
    const liveBadge = await screen.findByTestId("live-watching-count");
    expect(liveBadge.textContent).toContain("14 watching now");

    // Embed container exposes Expand landscape fullscreen button + rotates to landscape
    const embedContainer = await screen.findByTestId("embed-player-container");
    const reqFsMock = vi.fn().mockImplementation(async () => {
      fsEl = embedContainer;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    embedContainer.requestFullscreen = reqFsMock;

    const expandBtn = screen.getByRole("button", { name: /Expand landscape/i });
    await act(async () => {
      fireEvent.click(expandBtn);
    });
    expect(reqFsMock).toHaveBeenCalledTimes(1);
    expect(lockMock).toHaveBeenCalledWith("landscape");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Exit full screen/i })).toBeTruthy();
    });
  });

  it("renders quick Download Movie button on movie MediaCard and modernizes PromoBanner without PromoPopup", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } =
      await import("@tanstack/react-router");
    const { routeTree } = await import("@/routeTree.gen");

    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: ["/policy"] }),
    });
    await router.load();

    // Verify root layout renders without PromoPopup modal dialog
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("dialog", { name: /partner offer/i })).toBeNull();

    cleanup();

    // Render MediaCard + PromoBanner inside a real minimal router context
    const testRoot = createRootRoute();
    const testIndex = createRoute({
      getParentRoute: () => testRoot,
      path: "/",
      component: () => (
        <QueryClientProvider client={queryClient}>
          <MediaModalProvider>
            <MediaCard
              item={{
                key: "cinemeta:movie-tt15239678",
                id: "movie-tt15239678",
                source: "cinemeta",
                section: "hollywood",
                title: "Dune: Part Two",
                poster: "https://example.com/dune.jpg",
                genres: ["Sci-Fi"],
                description: "Desert epic.",
                mediaType: "movie",
                imdbId: "tt15239678",
              }}
            />
            <PromoBanner banner={PROMO_BANNERS[0]!} />
          </MediaModalProvider>
        </QueryClientProvider>
      ),
    });
    const testRouter = createRouter({
      routeTree: testRoot.addChildren([testIndex]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await testRouter.load();

    render(<RouterProvider router={testRouter} />);

    expect(
      await screen.findByRole("button", { name: /Download Movie — Dune: Part Two/i }),
    ).toBeTruthy();
    expect(screen.getByRole("complementary", { name: /Sponsored: 1xBet/i })).toBeTruthy();
  });
});

describe("Race-to-load secondary provider failover & live airing server catalog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearServerCatalogCache();
    clearClientMemoryCache();
  });

  it("races multiple secondary providers in parallel and selects the first healthy manifest/stream", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("broken-backup")) {
        return new Response("Forbidden", { status: 403 });
      }
      if (url.includes("html-trap")) {
        return new Response("<html><body>Blocked</body></html>", { status: 200 });
      }
      if (url.includes("fast-backup")) {
        return new Response("#EXTM3U\n#EXTINF:10,\nseg0.ts", { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    });

    const winnerIdx = await raceSecondarySources(
      [
        { url: "https://broken-backup.example.com/master.m3u8", type: "hls", label: "Server 2" },
        { url: "https://html-trap.example.com/master.m3u8", type: "hls", label: "Server 3" },
        { url: "https://fast-backup.example.com/master.m3u8", type: "hls", label: "Server 4" },
      ],
      2000,
    );

    expect(winnerIdx).toBe(2);
  });

  it("races secondary providers on primary fatal error and updates video source to the winning backup", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("dead-backup")) {
        return new Response("Unavailable", { status: 503 });
      }
      if (url.includes("healthy-backup")) {
        return new Response("", { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    });

    const { container } = render(
      <VideoPlayer
        stream={{
          url: "https://primary-dead.example.com/video.mp4",
          type: "mp4",
          provider: "SHADOW Stream",
          isDemo: false,
          sources: [
            { url: "https://primary-dead.example.com/video.mp4", type: "mp4", label: "Server 1" },
            { url: "https://dead-backup.example.com/video.mp4", type: "mp4", label: "Server 2" },
            { url: "https://healthy-backup.example.com/video.mp4", type: "mp4", label: "Server 3" },
          ],
        }}
        title="Race Failover Player Test"
        onBack={() => {}}
      />,
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.src).toContain("primary-dead.example.com");

    await act(async () => {
      fireEvent.error(video);
    });

    await waitFor(() => {
      expect(video.src).toContain("healthy-backup.example.com");
    });
  });

  it("serves /api/catalog/section with edge Cache-Control and auto-surfaces newly aired TVmaze schedule shows", async () => {
    clearServerCatalogCache();
    clearClientMemoryCache();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.tvmaze.com/schedule?country=KR")) {
        return new Response(
          JSON.stringify([
            {
              season: 1,
              number: 14,
              airdate: "2026-11-27",
              show: {
                id: 99123,
                name: "Seoul Midnight Pulse",
                type: "Scripted",
                language: "Korean",
                genres: ["Drama", "Thriller"],
                status: "Running",
                premiered: "2026-10-01",
                rating: { average: 8.7 },
                weight: 98,
                network: { name: "tvN", country: { name: "Korea, Republic of", code: "KR" } },
                externals: { imdb: "tt9991234" },
                image: {
                  medium: "https://static.tvmaze.com/kr.jpg",
                  original: "https://static.tvmaze.com/kr-orig.jpg",
                },
                summary: "<p>A brand-new airing K-Drama thriller.</p>",
              },
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes("api.tvmaze.com/schedule")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({ metas: [] }), { status: 200 });
    });

    const res = await handleCatalogApiRequest(
      new Request("http://localhost:3000/api/catalog/section?section=k-dramas&lang=en"),
    );
    expect(res?.status).toBe(200);
    expect(res?.headers.get("cache-control")).toBe(
      "public, max-age=180, s-maxage=600, stale-while-revalidate=3600",
    );

    const payload = (await res?.json()) as {
      items: { id: string; title: string; latestEpisode?: number }[];
      shelves: { id: string; items: { id: string; title: string; latestEpisode?: number }[] }[];
    };
    const aired = payload.items.find((it) => it.title === "Seoul Midnight Pulse");
    expect(aired).toBeTruthy();
    expect(aired?.latestEpisode).toBe(14);
    expect(payload.shelves[0]?.items.some((it) => it.title === "Seoul Midnight Pulse")).toBe(true);

    // Direct regional builder also retains the aired episode badge
    const directKdrama = await computeLiveSectionCatalog("k-dramas", "en");
    expect(
      directKdrama.items.find((item) => item.title === "Seoul Midnight Pulse")?.latestEpisode,
    ).toBe(14);
  });
});
