import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NollywoodPage } from "@/components/media/NollywoodPage";

const navigation = vi.hoisted(() => ({ stop: () => {} }));
const router = { subscribe: (_event: string, callback: () => void) => { navigation.stop = callback; return () => {}; } };
vi.mock("@tanstack/react-router", () => ({ useRouter: () => router }));
afterEach(cleanup);

describe("Nollywood inline movies", () => {
  it("plays a full movie inline and clears the previous player when choosing another", () => {
    const view = render(<NollywoodPage />);
    fireEvent.click(view.getByRole("button", { name: "Watch Unexpected Places" }));
    const first = view.container.querySelector("iframe");
    expect(first?.getAttribute("src")).toContain("/embed/InVf3C6-Gmo");
    fireEvent.click(view.getByRole("button", { name: "Watch Ruse" }));
    expect(first?.getAttribute("src")).toBe("about:blank");
    expect(view.container.querySelectorAll("iframe")).toHaveLength(1);
    expect(view.container.querySelector("iframe")?.getAttribute("src")).toContain("/embed/3rNo06AZd-s");
  });

  it("stops full-movie playback on navigation away", () => {
    const view = render(<NollywoodPage />);
    fireEvent.click(view.getByRole("button", { name: "Watch Ruse" }));
    const frame = view.container.querySelector("iframe");
    act(() => navigation.stop());
    expect(frame?.getAttribute("src")).toBe("about:blank");
    expect(view.container.querySelector("iframe")).toBeNull();
  });
});