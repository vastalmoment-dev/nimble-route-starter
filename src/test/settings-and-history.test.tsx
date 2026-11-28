import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { MediaItem } from "@/lib/catalog/types";
import { LanguageProvider } from "@/lib/i18n";
import { siteLanguage } from "@/lib/i18n/language";
import { playbackProgress } from "@/lib/player/progress";
import {
  AUTO_NEXT_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  resolvePreferredAnimeAudio,
  userSettings,
} from "@/lib/settings/store";
import { watchlist } from "@/lib/watchlist/store";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
    onClick,
    ...rest
  }: {
    to?: string;
    children?: ReactNode;
    className?: string;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <a href={typeof to === "string" ? to : "#"} className={className} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

import { SectionPage } from "@/components/media/SectionPage";
import { Shelf } from "@/components/media/Shelf";
import { SettingsPage } from "@/components/settings/SettingsPage";
import VideoPlayer from "@/components/player/VideoPlayer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MediaModalProvider } from "@/components/media/MediaModalContext";

const ANIME_ITEM: MediaItem = {
  key: "anilist:16498",
  id: "16498",
  source: "anilist",
  section: "anime",
  title: "Attack on Titan",
  poster: "https://example.com/aot.jpg",
  genres: ["Action", "Drama"],
  description: "Humanity fights Titans.",
  mediaType: "tv",
};

const SECOND_ANIME_ITEM: MediaItem = {
  key: "anilist:21",
  id: "21",
  source: "anilist",
  section: "anime",
  title: "One Piece",
  poster: "https://example.com/op.jpg",
  genres: ["Action", "Adventure"],
  description: "Pirate adventure.",
  mediaType: "tv",
};

const MOVIE_ITEM: MediaItem = {
  key: "cinemeta:movie-tt0133093",
  id: "movie-tt0133093",
  source: "cinemeta",
  section: "hollywood",
  title: "The Matrix",
  poster: "https://example.com/matrix.jpg",
  genres: ["Sci-Fi", "Action"],
  description: "Neo wakes up.",
  mediaType: "movie",
};

function resetAllLocalState() {
  window.localStorage.clear();
  siteLanguage.set("en");
  userSettings.reset();
  playbackProgress.clearHistory("all");
  watchlist.clear();
}

describe("Browser-only user settings store & Dub-first preference", () => {
  beforeEach(resetAllLocalState);
  afterEach(resetAllLocalState);

  it("persists Dub-first default strictly in browser localStorage and resolves anime audio accordingly", () => {
    expect(userSettings.get().defaultAnimeAudio).toBe("sub");
    expect(resolvePreferredAnimeAudio({ settings: userSettings.get() })).toBe("sub");

    // Simulate previously watching episode 1 in sub at an earlier timestamp
    const earlier = Date.now() - 60_000;

    // Now switch global setting to Dub first
    const updated = userSettings.update({
      defaultAnimeAudio: "dub",
      defaultAnimeAudioUpdatedAt: earlier + 30_000,
    });
    expect(updated.defaultAnimeAudio).toBe("dub");

    const storedRaw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    expect(storedRaw).toBeTruthy();
    expect(JSON.parse(storedRaw!).defaultAnimeAudio).toBe("dub");

    // Global Dub preference overrides stale per-show sub timestamp
    expect(
      resolvePreferredAnimeAudio({
        lastWatched: { season: 1, episode: 1, audio: "sub", updatedAt: earlier },
        settings: updated,
      }),
    ).toBe("dub");

    // Fresh explicit URL param or newer per-show switch still wins when intentional
    expect(
      resolvePreferredAnimeAudio({
        explicitAudio: "sub",
        lastWatched: { season: 1, episode: 1, audio: "sub", updatedAt: earlier },
        settings: updated,
      }),
    ).toBe("sub");
    expect(
      resolvePreferredAnimeAudio({
        lastWatched: { season: 1, episode: 2, audio: "sub", updatedAt: earlier + 45_000 },
        settings: updated,
      }),
    ).toBe("sub");

    // Reset restores defaults cleanly
    const reset = userSettings.reset();
    expect(reset.defaultAnimeAudio).toBe("sub");
    expect(reset.skipIntroSeconds).toBe(85);
  });

  it("syncs autoPlayNext with shadow:auto-next and VideoPlayer toggles", () => {
    userSettings.update({ autoPlayNext: false });
    expect(window.localStorage.getItem(AUTO_NEXT_STORAGE_KEY)).toBe("false");

    render(
      <VideoPlayer
        stream={{
          url: "https://example.com/ep1.mp4",
          type: "mp4",
          provider: "SHADOW Stream",
          isDemo: false,
        }}
        title="Attack on Titan"
        subtitle="Episode 1"
        onBack={() => {}}
        onNext={() => {}}
      />,
    );

    const autoNextBtn = screen.getByRole("button", { name: /auto next: off/i });
    fireEvent.click(autoNextBtn);
    expect(userSettings.get().autoPlayNext).toBe(true);
    expect(window.localStorage.getItem(AUTO_NEXT_STORAGE_KEY)).toBe("true");
  });
});

describe("Continue Watching tracking & selective/full watch history deletion", () => {
  beforeEach(resetAllLocalState);
  afterEach(resetAllLocalState);

  it("removes a specific anime across Continue Watching, last-watched, and episode progress without touching movies or other anime", () => {
    playbackProgress.save({
      source: "anilist",
      id: ANIME_ITEM.id,
      season: 1,
      episode: 3,
      currentTime: 245,
      duration: 1420,
      audio: "dub",
      item: ANIME_ITEM,
    });
    playbackProgress.save({
      source: "anilist",
      id: ANIME_ITEM.id,
      season: 1,
      episode: 4,
      currentTime: 120,
      duration: 1420,
      audio: "dub",
      item: ANIME_ITEM,
    });
    playbackProgress.save({
      source: "anilist",
      id: SECOND_ANIME_ITEM.id,
      season: 1,
      episode: 10,
      currentTime: 500,
      duration: 1420,
      audio: "sub",
      item: SECOND_ANIME_ITEM,
    });
    playbackProgress.save({
      source: "cinemeta",
      id: MOVIE_ITEM.id,
      season: 1,
      episode: 1,
      currentTime: 1800,
      duration: 8160,
      item: MOVIE_ITEM,
    });

    expect(playbackProgress.getContinueWatchingSnapshot()).toHaveLength(3);

    // Delete specific anime
    playbackProgress.removeShowHistory("anilist", ANIME_ITEM.id);

    const remaining = playbackProgress.getContinueWatchingSnapshot();
    expect(remaining).toHaveLength(2);
    expect(remaining.some((e) => e.item.id === ANIME_ITEM.id)).toBe(false);
    expect(playbackProgress.getLastWatched("anilist", ANIME_ITEM.id)).toBeNull();
    expect(playbackProgress.get("anilist", ANIME_ITEM.id, 1, 3)).toBeNull();
    expect(playbackProgress.get("anilist", ANIME_ITEM.id, 1, 4)).toBeNull();

    // Other anime and movie remain intact
    expect(playbackProgress.getLastWatched("anilist", SECOND_ANIME_ITEM.id)?.episode).toBe(10);
    expect(playbackProgress.get("cinemeta", MOVIE_ITEM.id, 1, 1)?.currentTime).toBe(1800);

    // Scoped anime wipe keeps movies
    playbackProgress.clearHistory("anime");
    const afterAnimeClear = playbackProgress.getContinueWatchingSnapshot();
    expect(afterAnimeClear).toHaveLength(1);
    expect(afterAnimeClear[0]?.item.id).toBe(MOVIE_ITEM.id);

    // Full history wipe clears everything
    playbackProgress.clearHistory("all");
    expect(playbackProgress.getContinueWatchingSnapshot()).toHaveLength(0);
    expect(playbackProgress.get("cinemeta", MOVIE_ITEM.id, 1, 1)).toBeNull();
  });
});

describe("SettingsPage UI & Homepage Continue Watching shelf controls", () => {
  beforeEach(resetAllLocalState);
  afterEach(resetAllLocalState);

  it("lets the user set Dub first, delete a single anime from watch history, and clear all history on SettingsPage", () => {
    playbackProgress.save({
      source: "anilist",
      id: ANIME_ITEM.id,
      season: 1,
      episode: 5,
      currentTime: 300,
      duration: 1420,
      audio: "sub",
      item: ANIME_ITEM,
    });
    playbackProgress.save({
      source: "cinemeta",
      id: MOVIE_ITEM.id,
      season: 1,
      episode: 1,
      currentTime: 900,
      duration: 7200,
      item: MOVIE_ITEM,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <SettingsPage />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    // Switch default anime audio to Dub first
    const dubButton = screen.getByRole("button", { name: /DUB · Load in Dub first/i });
    fireEvent.click(dubButton);
    expect(userSettings.get().defaultAnimeAudio).toBe("dub");

    // Both history entries render
    expect(screen.getByText("Attack on Titan")).toBeInTheDocument();
    expect(screen.getByText("The Matrix")).toBeInTheDocument();

    // Delete Attack on Titan only
    const deleteAot = screen.getByRole("button", {
      name: /Delete watch history for Attack on Titan/i,
    });
    fireEvent.click(deleteAot);

    expect(screen.queryByText("Attack on Titan")).toBeNull();
    expect(screen.getByText("The Matrix")).toBeInTheDocument();

    // Clear remaining history
    const clearAll = screen.getByRole("button", { name: /Clear All History/i });
    fireEvent.click(clearAll);

    expect(screen.queryByText("The Matrix")).toBeNull();
    expect(playbackProgress.getContinueWatchingSnapshot()).toHaveLength(0);
  });

  it("displays Continue Watching cards on the homepage shelf with Dub-first watch links and per-card removal", () => {
    userSettings.update({ defaultAnimeAudio: "dub" });
    playbackProgress.save({
      source: "anilist",
      id: ANIME_ITEM.id,
      season: 1,
      episode: 2,
      currentTime: 180,
      duration: 1420,
      item: ANIME_ITEM,
    });
    playbackProgress.save({
      source: "cinemeta",
      id: MOVIE_ITEM.id,
      season: 1,
      episode: 1,
      currentTime: 600,
      duration: 7200,
      item: MOVIE_ITEM,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const onRemove = vi.fn((item: MediaItem) => {
      playbackProgress.removeShowHistory(item.source, item.id);
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <MediaModalProvider>
            <Shelf
              testId="continue-watching-shelf"
              title="Continue Watching"
              items={playbackProgress.getContinueWatchingSnapshot().map((e) => e.item)}
              onRemoveItem={onRemove}
            />
          </MediaModalProvider>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const removeBtn = screen.getByRole("button", {
      name: /Remove Attack on Titan from Continue Watching/i,
    });
    act(() => {
      fireEvent.click(removeBtn);
    });

    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: ANIME_ITEM.id }));
    expect(playbackProgress.getContinueWatchingSnapshot()).toHaveLength(1);
    expect(playbackProgress.getContinueWatchingSnapshot()[0]?.item.id).toBe(MOVIE_ITEM.id);

    rerender(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <MediaModalProvider>
            <Shelf
              testId="continue-watching-shelf"
              title="Continue Watching"
              items={playbackProgress.getContinueWatchingSnapshot().map((e) => e.item)}
              onRemoveItem={onRemove}
            />
          </MediaModalProvider>
        </LanguageProvider>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("button", { name: /Remove Attack on Titan/i })).toBeNull();
  });

  it("renders SectionPage home with live Continue Watching shelf from localStorage", async () => {
    playbackProgress.save({
      source: "cinemeta",
      id: MOVIE_ITEM.id,
      season: 1,
      episode: 1,
      currentTime: 600,
      duration: 7200,
      item: MOVIE_ITEM,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["section", "home", "en"], {
      section: "home",
      featured: [MOVIE_ITEM],
      shelves: [{ id: "trending", title: "Trending Now", items: [ANIME_ITEM] }],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <MediaModalProvider>
            <SectionPage section="home" />
          </MediaModalProvider>
        </LanguageProvider>
      </QueryClientProvider>,
    );

    const shelf = await screen.findByTestId("continue-watching-shelf");
    expect(shelf).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear History/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /History & Settings/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Clear History/i }));
    expect(playbackProgress.getContinueWatchingSnapshot()).toHaveLength(0);
    expect(screen.queryByTestId("continue-watching-shelf")).toBeNull();
  });
});
