import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell, DISCORD_URL } from "@/components/layout/AppShell";
import VideoPlayer from "@/components/player/VideoPlayer";
import { loadAnimeFallbackCatalog, loadFallbackCatalog } from "@/lib/catalog/fallback";

describe("Discord community links across header, footer, and WatchPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Join Discord links in both header and footer opening in a new tab", async () => {
    const { RouterProvider, createMemoryHistory, createRouter } =
      await import("@tanstack/react-router");
    const { routeTree } = await import("@/routeTree.gen");

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: ["/policy"] }),
    });

    await router.load();
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    const discordLinks = await screen.findAllByRole("link", { name: /Join Discord/i });
    expect(discordLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of discordLinks) {
      expect(link.getAttribute("href")).toBe("https://discord.gg/uKtF6Efs2");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(DISCORD_URL).toBe("https://discord.gg/uKtF6Efs2");
  });

  it("renders the Discord support prompt directly below player controls on WatchPage", async () => {
    const { RouterProvider, createMemoryHistory, createRouter } =
      await import("@tanstack/react-router");
    const { routeTree } = await import("@/routeTree.gen");

    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";
      if (url.includes("cinemeta")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              meta: {
                id: "tt15239678",
                type: "movie",
                name: "Dune: Part Two",
                poster: "https://example.com/poster.jpg",
                description: "Movie test",
                genres: ["Sci-Fi"],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
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

    expect(await screen.findByText(/Stream buffering or not loading\?/i)).toBeTruthy();
    const supportLink = screen.getByRole("link", {
      name: /Report it or request titles on our Discord/i,
    });
    expect(supportLink.getAttribute("href")).toBe("https://discord.gg/uKtF6Efs2");
    expect(supportLink.getAttribute("target")).toBe("_blank");
    expect(supportLink.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("Category fallback catalogs coverage", () => {
  it("provides non-empty items for K-Dramas, Hollywood, Bollywood, Tollywood, Nollywood, Cartoons, and Anime", async () => {
    const fallback = await loadFallbackCatalog();
    expect(fallback["k-dramas"].length).toBeGreaterThan(0);
    expect(fallback.hollywood.length).toBeGreaterThan(0);
    expect(fallback.bollywood.length).toBeGreaterThan(0);
    expect(fallback.tollywood.length).toBeGreaterThan(0);
    expect(fallback.nollywood.length).toBeGreaterThan(0);
    expect(fallback.cartoons.length).toBeGreaterThan(0);

    const anime = loadAnimeFallbackCatalog();
    expect(anime.length).toBeGreaterThan(0);
    expect(anime.every((item) => item.section === "anime" && item.source === "anilist")).toBe(true);
  });
});

describe("VideoPlayer auto-failover and mobile landscape fullscreen", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("automatically switches to the next backup source on stream error with status feedback", () => {
    const { container } = render(
      <VideoPlayer
        stream={{
          url: "https://primary.example.com/stream.mp4",
          type: "mp4",
          provider: "SHADOW Stream",
          isDemo: false,
          sources: [
            { url: "https://primary.example.com/stream.mp4", type: "mp4", label: "Server 1" },
            { url: "https://backup.example.com/stream.mp4", type: "mp4", label: "Server 2" },
          ],
        }}
        title="Failover Test"
        onBack={() => {}}
      />,
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.src).toContain("primary.example.com");

    fireEvent(video, new Event("error"));

    const status = screen.getByTestId("player-buffering-status");
    expect(status.textContent).toContain("Switching to backup server (Server 2)");
    expect(video.src).toContain("backup.example.com");
    expect(screen.queryByText(/Playback failed/i)).toBeNull();
  });

  it("enters fullscreen, locks screen orientation to landscape, and unlocks on exit", async () => {
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
    const exitFsMock = vi.fn().mockImplementation(async () => {
      fsEl = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFsMock,
    });

    const { container } = render(
      <VideoPlayer
        stream={{
          url: "https://example.com/video.mp4",
          type: "mp4",
          provider: "SHADOW Stream",
          isDemo: false,
        }}
        title="Landscape Fullscreen Test"
        onBack={() => {}}
      />,
    );

    const rootPlayer = container.firstElementChild as HTMLElement;
    const reqFsMock = vi.fn().mockImplementation(async () => {
      fsEl = rootPlayer;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    rootPlayer.requestFullscreen = reqFsMock;

    const fsBtn = screen.getByRole("button", { name: "Full screen" });
    await act(async () => {
      fireEvent.click(fsBtn);
    });

    expect(reqFsMock).toHaveBeenCalledTimes(1);
    expect(lockMock).toHaveBeenCalledWith("landscape");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Exit full screen" })).toBeTruthy();
    });

    const exitBtn = screen.getByRole("button", { name: "Exit full screen" });
    await act(async () => {
      fireEvent.click(exitBtn);
    });

    expect(exitFsMock).toHaveBeenCalledTimes(1);
    expect(unlockMock).toHaveBeenCalled();
  });
});

// Keep AppShell referenced cleanly to validate module export in Vitest
void AppShell;
