import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VideoPlayer from "@/components/player/VideoPlayer";
import type { MediaItem } from "@/lib/catalog/types";
import { watchlist } from "@/lib/watchlist/store";

const SAMPLE_ITEM: MediaItem = {
  key: "cinemeta:movie-tt8115900",
  id: "movie-tt8115900",
  source: "cinemeta",
  section: "cartoons",
  title: "The Bad Guys",
  poster: "https://images.metahub.space/poster/medium/tt8115900/img",
  genres: ["Animation", "Comedy"],
  description: "Cracking good heist cartoon.",
  mediaType: "movie",
};

describe("My Watchlist localStorage store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    watchlist.clear();
  });

  it("persists added items to localStorage and toggles/removes cleanly", () => {
    expect(watchlist.has(SAMPLE_ITEM.key)).toBe(false);

    const added = watchlist.toggle(SAMPLE_ITEM);
    expect(added).toBe(true);
    expect(watchlist.has(SAMPLE_ITEM.key)).toBe(true);

    const stored = JSON.parse(window.localStorage.getItem("shadow:watchlist:v1") || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].item.title).toBe("The Bad Guys");

    const removed = watchlist.toggle(SAMPLE_ITEM);
    expect(removed).toBe(false);
    expect(watchlist.snapshot()).toHaveLength(0);
  });
});

describe("VideoPlayer Skip Intro & Auto-Play Next Episode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("skips intro forward by skipIntroSeconds when Skip Intro is clicked", () => {
    const { container } = render(
      <VideoPlayer
        stream={{
          url: "https://example.com/test.mp4",
          type: "mp4",
          provider: "SHADOW Stream",
          isDemo: false,
        }}
        title="Attack on Titan"
        subtitle="Episode 1 · SUB"
        onBack={() => {}}
        skipIntroSeconds={85}
      />,
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video).toBeTruthy();

    Object.defineProperty(video, "duration", { configurable: true, value: 1400 });
    fireEvent(video, new Event("canplay"));
    video.currentTime = 5;
    fireEvent(video, new Event("timeupdate"));

    const skipButtons = screen.getAllByRole("button", { name: /skip intro/i });
    expect(skipButtons.length).toBeGreaterThan(0);

    fireEvent.click(skipButtons[0]!);
    expect(video.currentTime).toBe(90);
  });

  it("auto-advances to the next episode after countdown when Auto Next is On", () => {
    const onNext = vi.fn();
    const { container } = render(
      <VideoPlayer
        stream={{
          url: "https://example.com/ep1.mp4",
          type: "mp4",
          provider: "SHADOW Stream",
          isDemo: false,
        }}
        title="Attack on Titan"
        subtitle="Episode 1 · SUB"
        onBack={() => {}}
        onNext={onNext}
        nextLabel="Episode 2"
      />,
    );

    const video = container.querySelector("video") as HTMLVideoElement;
    fireEvent(video, new Event("canplay"));
    fireEvent(video, new Event("ended"));

    expect(screen.getByText(/up next in 3s/i)).toBeTruthy();

    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("respects toggling Auto Next Off and lets user advance manually", () => {
    const onNext = vi.fn();
    const { container } = render(
      <VideoPlayer
        stream={{
          url: "https://example.com/ep1.mp4",
          type: "mp4",
          provider: "SHADOW Stream",
          isDemo: false,
        }}
        title="Solo Leveling"
        subtitle="Episode 1 · SUB"
        onBack={() => {}}
        onNext={onNext}
        nextLabel="Episode 2"
      />,
    );

    const autoBtn = screen.getByRole("button", { name: /auto next: on/i });
    fireEvent.click(autoBtn);
    expect(screen.getByRole("button", { name: /auto next: off/i })).toBeTruthy();

    const video = container.querySelector("video") as HTMLVideoElement;
    fireEvent(video, new Event("ended"));

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onNext).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /play next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
