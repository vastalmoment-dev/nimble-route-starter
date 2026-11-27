import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdsterraScript } from "@/components/ads/AdsterraScript";
import { AnimeCatalogGrid } from "@/components/media/AnimeCatalogGrid";
import VideoPlayer from "@/components/player/VideoPlayer";
import { parseMasterPlaylist, parseMediaPlaylist } from "@/lib/download/hls";
import { siteLanguage } from "@/lib/i18n/language";
import { playbackProgress } from "@/lib/player/progress";
import { activeCueText, parseVtt } from "@/lib/player/subtitles";
import { signMediaProxyUrl, verifyMediaProxyToken } from "@/lib/stream/media-proxy";

describe("Language preference (EN / FR)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    siteLanguage.set("en");
  });

  afterEach(() => {
    window.localStorage.clear();
    siteLanguage.set("en");
  });

  it("defaults to English and persists switching to French", () => {
    expect(siteLanguage.get()).toBe("en");
    siteLanguage.set("fr");
    expect(siteLanguage.get()).toBe("fr");
    expect(window.localStorage.getItem("shadow:lang:v1")).toBe("fr");
  });
});

describe("Playback progress & resume continuity", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves timestamp per episode and preserves position when switching Sub <-> Dub or returning later", () => {
    playbackProgress.save({
      source: "anilist",
      id: "16498",
      season: 1,
      episode: 5,
      currentTime: 412.5,
      duration: 1420,
      audio: "sub",
    });

    const saved = playbackProgress.get("anilist", "16498", 1, 5);
    expect(saved?.currentTime).toBe(412.5);
    expect(saved?.audio).toBe("sub");

    const last = playbackProgress.getLastWatched("anilist", "16498");
    expect(last?.episode).toBe(5);
    expect(last?.season).toBe(1);
    expect(last?.audio).toBe("sub");

    // Switching audio saves updated audio preference while keeping the show resume state
    playbackProgress.save({
      source: "anilist",
      id: "16498",
      season: 1,
      episode: 5,
      currentTime: 412.5,
      duration: 1420,
      audio: "dub",
    });
    expect(playbackProgress.get("anilist", "16498", 1, 5)?.currentTime).toBe(412.5);
    expect(playbackProgress.getLastWatched("anilist", "16498")?.audio).toBe("dub");
  });

  it("clears episode resume once >=97% completed", () => {
    playbackProgress.save({
      source: "cinemeta",
      id: "movie-tt8115900",
      season: 1,
      episode: 1,
      currentTime: 5850,
      duration: 6000,
    });

    expect(playbackProgress.get("cinemeta", "movie-tt8115900", 1, 1)).toBeNull();
  });
});

describe("Subtitles inside the video frame & player resume seek", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses WebVTT cues and matches active timestamp cues cleanly", () => {
    const cues = parseVtt(
      [
        "WEBVTT",
        "",
        "00:00:01.000 --> 00:00:04.500",
        "<i>Hello</i> world!",
        "",
        "00:00:06.000 --> 00:00:09.000",
        "Second line",
      ].join("\n"),
    );

    expect(cues).toHaveLength(2);
    expect(activeCueText(cues, 2.0)).toBe("Hello world!");
    expect(activeCueText(cues, 5.0)).toBe("");
    expect(activeCueText(cues, 7.2)).toBe("Second line");
  });

  it("seeks to initialTime on loadedmetadata and renders subtitles inside data-testid=video-frame", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        ["WEBVTT", "", "00:02:00.000 --> 00:02:05.000", "Resumed subtitle cue"].join("\n"),
        { status: 200 },
      ),
    );

    const onTimeProgress = vi.fn();
    const { container } = render(
      <VideoPlayer
        stream={{
          url: "https://example.com/movie.mp4",
          type: "mp4",
          provider: "SHADOW Stream",
          isDemo: false,
          subtitles: [{ url: "/api/media/sub?ref=test", lang: "en", label: "English" }],
        }}
        title="The Bad Guys"
        onBack={() => {}}
        initialTime={122}
        onTimeProgress={onTimeProgress}
      />,
    );

    const frame = screen.getByTestId("video-frame");
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(frame.contains(video)).toBe(true);

    Object.defineProperty(video, "duration", { configurable: true, value: 3600 });
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1920 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 800 });

    fireEvent(video, new Event("loadedmetadata"));
    expect(video.currentTime).toBe(122);

    // Allow VTT fetch promise to settle and render caption inside the video frame
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent(video, new Event("timeupdate"));

    const captionBox = screen.getByTestId("video-subtitles");
    expect(frame.contains(captionBox)).toBe(true);
    expect(captionBox.textContent).toContain("Resumed subtitle cue");
    expect(onTimeProgress).toHaveBeenCalledWith(122, 3600);
  });
});

describe("Adsterra script placement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.getElementById("shadow-adsterra-loader")?.remove();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.getElementById("shadow-adsterra-loader")?.remove();
  });

  it("does not inject Adsterra script on watch routes and injects once after browse dwell", () => {
    const { rerender } = render(<AdsterraScript enabled={false} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(document.getElementById("shadow-adsterra-loader")).toBeNull();

    rerender(<AdsterraScript enabled={true} />);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    const script = document.getElementById("shadow-adsterra-loader");
    expect(script).toBeTruthy();
    expect(script?.getAttribute("data-cfasync")).toBe("false");
    expect(script?.getAttribute("src")).toBe(
      "https://abscloud.org/1/36ab3dcb9658b1a279bded157b344c72",
    );
  });
});

describe("AnimeCatalogGrid search deduplication", () => {
  it("does not render the duplicate small search input below the header search", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AnimeCatalogGrid genres={[]} />
      </QueryClientProvider>,
    );

    expect(screen.queryByPlaceholderText(/filter all anime/i)).toBeNull();
  });
});

describe("Signed segment proxy & AES-128 HLS downloader parser", () => {
  it("signs and verifies temporary proxy URLs and rejects tampered tokens", () => {
    const signed = signMediaProxyUrl("https://cdn.example.com/seg-1.ts", "https://vidsrc.buzz/");
    const token = new URL(`http://localhost:3000${signed}`).searchParams.get("token");
    expect(token).toBeTruthy();

    const verified = verifyMediaProxyToken(token);
    expect(verified?.u).toBe("https://cdn.example.com/seg-1.ts");
    expect(verified?.ref).toBe("https://vidsrc.buzz/");

    expect(verifyMediaProxyToken(`${token}tampered`)).toBeNull();
  });

  it("parses relative proxy playlists, AES-128 keys, and keeps video variants reliably", () => {
    const master = [
      "#EXTM3U",
      '#EXT-X-STREAM-INF:BANDWIDTH=120000,CODECS="mp4a.40.2"',
      "/api/media/segment?token=audio-only",
      '#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"',
      "/api/anilast/hls?url=https%3A%2F%2Fcdn.example.com%2F720.m3u8",
    ].join("\n");

    const variants = parseMasterPlaylist(master, "/api/anilast/hls?url=master");
    expect(variants).toHaveLength(1);
    expect(variants[0]?.uri).toContain("/api/anilast/hls");

    const media = parseMediaPlaylist(
      [
        "#EXTM3U",
        "#EXT-X-MEDIA-SEQUENCE:4",
        '#EXT-X-KEY:METHOD=AES-128,URI="/api/media/segment?token=key123",IV=0x00000000000000000000000000000005',
        "/api/media/segment?token=seg1",
      ].join("\n"),
      "/api/anilast/hls?url=720",
    );
    expect(media.mediaSequence).toBe(4);
    expect(media.encrypted).toBe(false);
    expect(media.key?.method).toBe("AES-128");
    expect(media.key?.uri).toContain("/api/media/segment?token=key123");
    expect(media.key?.iv).toBe("00000000000000000000000000000005");
    expect(media.segments).toHaveLength(1);
  });
});

describe("Global playback keyboard shortcuts & accessibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
    siteLanguage.set("en");
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles Space/K play-pause, M mute, arrows/J/L seek & volume, C captions, ? shortcuts overlay, and ignores text inputs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nLine one", { status: 200 }),
    );

    const { container } = render(
      <div>
        <input aria-label="Search external" type="text" />
        <VideoPlayer
          stream={{
            url: "https://example.com/show.mp4",
            type: "mp4",
            provider: "SHADOW Stream",
            isDemo: false,
            subtitles: [{ url: "/api/media/sub?ref=test", lang: "en", label: "English" }],
          }}
          title="Shortcut Test"
          onBack={() => {}}
        />
      </div>,
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 200 });
    let pausedState = true;
    Object.defineProperty(video, "paused", {
      configurable: true,
      get: () => pausedState,
    });
    const playSpy = vi.spyOn(video, "play").mockImplementation(() => {
      pausedState = false;
      return Promise.resolve();
    });
    const pauseSpy = vi.spyOn(video, "pause").mockImplementation(() => {
      pausedState = true;
    });

    fireEvent(video, new Event("loadedmetadata"));
    await act(async () => {
      await Promise.resolve();
    });
    playSpy.mockClear();

    // Space toggles play
    fireEvent.keyDown(window, { key: " " });
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("player-shortcut-feedback").textContent).toBe("Play");

    // Uppercase K toggles pause (case-insensitive)
    fireEvent.keyDown(window, { key: "K" });
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("player-shortcut-feedback").textContent).toBe("Pause");

    // ArrowRight seeks forward 10s, J seeks backward 10s
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(video.currentTime).toBe(10);
    fireEvent.keyDown(window, { key: "J" });
    expect(video.currentTime).toBe(0);

    // Uppercase M toggles mute
    expect(video.muted).toBe(false);
    fireEvent.keyDown(window, { key: "M" });
    expect(video.muted).toBe(true);
    fireEvent.keyDown(window, { key: "m" });
    expect(video.muted).toBe(false);

    // ArrowDown reduces volume by 0.1
    video.volume = 0.8;
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(video.volume).toBeCloseTo(0.7, 2);

    // C toggles subtitles off then back on
    fireEvent.keyDown(window, { key: "c" });
    expect(screen.getByTestId("player-shortcut-feedback").textContent).toBe("Subtitles: Off");
    fireEvent.keyDown(window, { key: "C" });
    expect(screen.getByTestId("player-shortcut-feedback").textContent).toBe("Subtitles: English");

    // ? opens keyboard shortcuts legend modal
    fireEvent.keyDown(window, { key: "?", shiftKey: true });
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeTruthy();

    // Shortcuts ignored while typing in text input
    const textInput = screen.getByLabelText("Search external");
    fireEvent.keyDown(textInput, { key: "M" });
    expect(video.muted).toBe(false);
  });
});

describe("Two-step Back navigation, ordered episodes & Policy page", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns from /watch to /title show page with ascending ordered episodes, then Back to / home", async () => {
    const { RouterProvider, createMemoryHistory, createRouter } =
      await import("@tanstack/react-router");
    const { routeTree } = await import("@/routeTree.gen");

    const mockCinemetaMeta = {
      meta: {
        id: "tt7741824",
        type: "series",
        name: "Test Drama",
        poster: "https://example.com/poster.jpg",
        description: "Ordered episode test drama.",
        genres: ["Drama"],
        videos: [
          { id: "v3", season: 2, episode: 1, name: "Return" },
          { id: "v2", season: 1, episode: 2, name: "Episode Two" },
          { id: "v1", season: 1, episode: 1, name: "Pilot" },
        ],
      },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";
      if (url.includes("cinemeta")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockCinemetaMeta), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
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
        initialEntries: ["/watch/cinemeta/series-tt7741824?season=1&ep=2"],
      }),
    });

    await router.load();
    render(<RouterProvider router={router} />);

    // Step 1: Click Back while watching -> lands on dedicated show page /title/cinemeta/series-tt7741824
    const watchBackBtn = await screen.findByRole("button", { name: "Back" });
    fireEvent.click(watchBackBtn);

    await waitForCompat(() => {
      expect(router.state.location.pathname).toBe("/title/cinemeta/series-tt7741824");
    });

    // Ordered episodes rendered in AniList-style ascending order (1 then 2) + Seasons visible
    const list = await screen.findByTestId("ordered-episode-list");
    const items = list.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("1");
    expect(items[1]?.textContent).toContain("2");
    expect(screen.getByRole("tab", { name: "Season 1" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Season 2" })).toBeTruthy();

    // Step 2: Click Back again on show page -> navigates to Home page (/)
    const titleBackBtn = screen.getByRole("button", { name: "Back to Home" });
    fireEvent.click(titleBackBtn);

    await waitForCompat(() => {
      expect(router.state.location.pathname).toBe("/");
    });
  });

  it("renders /policy with no-hosting disclaimer and anti-bot ban warning without leaking source site names", async () => {
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
    const { container } = render(<RouterProvider router={router} />);

    const heading = await screen.findByRole("heading", { name: /Policy, DMCA/i });
    expect(heading).toBeTruthy();
    const text = container.textContent ?? "";
    expect(text).toMatch(/does not host, upload, store/i);
    expect(text).toMatch(/third-party/i);
    expect(text).toMatch(/bots/i);
    expect(text).toMatch(/permanently banned/i);
    expect(text.toLowerCase()).not.toContain("anilast");
  });

  it("never falls back to YouTube trailers on WatchPage when watching shows without IMDb IDs", async () => {
    const { RouterProvider, createMemoryHistory, createRouter } =
      await import("@tanstack/react-router");
    const { routeTree } = await import("@/routeTree.gen");

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";
      if (url.includes("api.tvmaze.com/shows/43687")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 43687,
              name: "Squid Game",
              type: "Scripted",
              language: "Korean",
              genres: ["Drama"],
              status: "Running",
              premiered: "2021-09-17",
              runtime: 55,
              rating: { average: 8.1 },
              weight: 99,
              network: null,
              webChannel: { name: "Netflix" },
              image: null,
              summary: "<p>Survival game.</p>",
              externals: { imdb: null },
              _embedded: {
                episodes: [
                  {
                    id: 1,
                    name: "Red Light",
                    season: 1,
                    number: 1,
                    runtime: 60,
                    image: null,
                    summary: "",
                  },
                ],
                seasons: [{ number: 1 }],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ ok: false, streamUrl: null, embedUrl: null, embedFallbacks: [] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({
        initialEntries: ["/watch/tvmaze/43687?season=1&ep=1"],
      }),
    });

    await router.load();
    const { container } = render(<RouterProvider router={router} />);

    const retryBtn = await screen.findByRole("button", { name: /Retry stream/i });
    expect(retryBtn).toBeTruthy();
    expect(container.innerHTML.toLowerCase()).not.toContain("youtube");
    expect(screen.queryByText(/Official trailer/i)).toBeNull();
  });
  it("returns from /anime -> /watch -> /title back to /anime instead of redirecting to Home", async () => {
    const { RouterProvider, createMemoryHistory, createRouter } =
      await import("@tanstack/react-router");
    const { routeTree } = await import("@/routeTree.gen");

    const mockAnilistResp = {
      data: {
        Page: {
          pageInfo: { total: 1, currentPage: 1, lastPage: 1, hasNextPage: false },
          media: [
            {
              id: 16498,
              idMal: 16498,
              title: { english: "Attack on Titan", romaji: "Shingeki no Kyojin" },
              coverImage: {
                large: "https://example.com/aot-l.jpg",
                extraLarge: "https://example.com/aot-xl.jpg",
              },
              bannerImage: "https://example.com/aot-b.jpg",
              episodes: 25,
              genres: ["Action"],
              averageScore: 85,
              seasonYear: 2013,
              format: "TV",
              status: "FINISHED",
              description: "Humanity fights Titans.",
            },
          ],
        },
        Media: {
          id: 16498,
          idMal: 16498,
          title: { english: "Attack on Titan", romaji: "Shingeki no Kyojin" },
          coverImage: {
            large: "https://example.com/aot-l.jpg",
            extraLarge: "https://example.com/aot-xl.jpg",
          },
          bannerImage: "https://example.com/aot-b.jpg",
          episodes: 2,
          genres: ["Action"],
          averageScore: 85,
          seasonYear: 2013,
          format: "TV",
          status: "FINISHED",
          description: "Humanity fights Titans.",
          characters: { edges: [] },
          relations: { edges: [] },
        },
      },
    };

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : "";
      if (url.includes("graphql.anilist.co")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockAnilistResp), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: false, streamUrl: null, embedFallbacks: [] }), {
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
        initialEntries: ["/anime"],
      }),
    });

    await router.load();
    render(<RouterProvider router={router} />);

    // Wait for Play link from the HeroCarousel on /anime and click to enter /watch
    const watchLinks = await screen.findAllByRole("link", {
      name: /Watch Now|Play Attack on Titan/i,
    });
    fireEvent.click(watchLinks[0]!);

    await waitForCompat(() => {
      expect(router.state.location.pathname).toBe("/watch/anilist/16498");
    });

    // Step 1: Click Back in WatchPage -> /title/anilist/16498
    const watchBackBtn = await screen.findByRole("button", { name: "Back" });
    fireEvent.click(watchBackBtn);

    await waitForCompat(() => {
      expect(router.state.location.pathname).toBe("/title/anilist/16498");
    });

    // Step 2: Click Back to Anime on Show page -> returns directly to /anime
    const backToAnimeBtn = await screen.findByRole("button", { name: /Back to Anime/i });
    fireEvent.click(backToAnimeBtn);

    await waitForCompat(() => {
      expect(router.state.location.pathname).toBe("/anime");
    });
  });

  it("saves Continue Watching per section with Resume badge and expands mobile search on focus", async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();

    const { playbackProgress, useShowProgress } = await import("@/lib/player/progress");
    const { RouterProvider, createMemoryHistory, createRouter } =
      await import("@tanstack/react-router");
    const { routeTree } = await import("@/routeTree.gen");

    playbackProgress.save({
      source: "cinemeta",
      id: "series-tt2580046",
      season: 2,
      episode: 7,
      currentTime: 320,
      duration: 1280,
      item: {
        key: "cinemeta:series-tt2580046",
        id: "series-tt2580046",
        source: "cinemeta",
        section: "cartoons",
        title: "Miraculous: Tales of Ladybug & Cat Noir",
        poster: "https://example.com/miraculous.jpg",
        genres: ["Animation"],
        description: "Ladybug & Cat Noir.",
        mediaType: "tv",
      },
    });

    function ProbeProgress() {
      const { last, progressPct } = useShowProgress("cinemeta", "series-tt2580046");
      return (
        <div data-testid="progress-probe">
          {last ? `S${last.season}E${last.episode}:${progressPct}` : "none"}
        </div>
      );
    }

    const { unmount } = render(<ProbeProgress />);
    expect(screen.getByTestId("progress-probe").textContent).toBe("S2E7:25");
    unmount();

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createRouter({
      routeTree,
      context: { queryClient },
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    await router.load();
    render(<RouterProvider router={router} />);

    // Mobile search bar expands cleanly on focus and collapses back when submitted
    const searchInput = screen.getByLabelText("Search titles");
    const form = searchInput.closest("form");
    expect(form?.getAttribute("data-mobile-expanded")).toBe("false");

    fireEvent.focus(searchInput);
    expect(form?.getAttribute("data-mobile-expanded")).toBe("true");

    fireEvent.change(searchInput, { target: { value: "miraculous" } });
    fireEvent.submit(form!);
    expect(form?.getAttribute("data-mobile-expanded")).toBe("false");
  });
});

async function waitForCompat(fn: () => void) {
  const { waitFor } = await import("@testing-library/react");
  return waitFor(fn);
}
