import { cleanup, fireEvent, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WatchPromoGate } from "@/components/ads/WatchPromoGate";

afterEach(cleanup);

function Playback({ start }: { start: () => void }) {
  useEffect(start, [start]);
  return null;
}

describe("Partner popup before playback", () => {
  it.each(["Anime", "Hollywood", "Bollywood", "K-Dramas", "Cartoons"])("holds %s playback until the ad is closed", () => {
    const start = vi.fn();
    const view = render(<WatchPromoGate><Playback start={start} /></WatchPromoGate>);
    expect(start).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "Close ad" }));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("allows playback after minimizing and does not restart when the ad reopens", () => {
    const start = vi.fn();
    const view = render(<WatchPromoGate><Playback start={start} /></WatchPromoGate>);
    expect(start).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "Minimize ad" }));
    expect(start).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole("button", { name: /1xBet ·/ }));
    fireEvent.click(view.getByRole("button", { name: "Close ad" }));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("requires a fresh popup when another title or episode is selected", () => {
    const start = vi.fn();
    const view = render(<WatchPromoGate key="first:1"><Playback start={start} /></WatchPromoGate>);
    fireEvent.click(view.getByRole("button", { name: "Close ad" }));
    expect(start).toHaveBeenCalledTimes(1);
    view.rerender(<WatchPromoGate key="first:2"><Playback start={start} /></WatchPromoGate>);
    expect(start).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole("button", { name: "Close ad" }));
    expect(start).toHaveBeenCalledTimes(2);
  });
});