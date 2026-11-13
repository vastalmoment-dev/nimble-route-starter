import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrailerFrame } from "@/components/player/TrailerFrame";

afterEach(cleanup);

describe("Trailer playback lifecycle", () => {
  it("stops playback immediately when leaving the watch page", () => {
    let stop = () => {};
    const view = render(<TrailerFrame youtubeId="test123" title="Test" registerStop={(callback) => { stop = callback; return () => {}; }} />);
    const frame = view.container.querySelector("iframe");
    const post = vi.spyOn(frame?.contentWindow ?? window, "postMessage");
    act(() => stop());
    expect(frame?.getAttribute("src")).toBe("about:blank");
    expect(post).toHaveBeenCalledWith(JSON.stringify({ event: "command", func: "stopVideo", args: [] }), "https://www.youtube-nocookie.com");
    expect(view.container.querySelector("iframe")).toBeNull();
  });

  it("stops when the viewer leaves the tab and does not autoplay on return", () => {
    const view = render(<TrailerFrame youtubeId="test123" title="Test" registerStop={() => () => {}} />);
    const frame = view.container.querySelector("iframe");
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    expect(frame?.getAttribute("src")).toBe("about:blank");
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    expect(view.container.querySelector("iframe")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Play trailer" }));
    expect(view.container.querySelector("iframe")?.getAttribute("src")).toContain("test123");
    hidden.mockRestore();
  });

  it("clears the player document when the watch page unmounts", () => {
    const view = render(<TrailerFrame youtubeId="test123" title="Test" registerStop={() => () => {}} />);
    const frame = view.container.querySelector("iframe");
    view.unmount();
    expect(frame?.getAttribute("src")).toBe("about:blank");
  });
});