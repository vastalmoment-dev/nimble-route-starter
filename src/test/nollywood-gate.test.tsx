import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NollywoodPage } from "@/components/media/NollywoodPage";

vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ subscribe: () => () => {} }) }));
afterEach(cleanup);

it("holds each Nollywood movie behind the partner popup and stops when switching", () => {
  const view = render(<NollywoodPage />);
  fireEvent.click(view.getByRole("button", { name: "Watch A Secret for the Season" }));
  expect(view.container.querySelector("iframe")).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Minimize ad" }));
  const first = view.getByTitle("A Secret for the Season movie");
  expect(first.getAttribute("src")).toContain("/embed/lL4jB2KM514");
  fireEvent.click(view.getByRole("button", { name: "Watch My Mother's Christmas Guest" }));
  expect(first.getAttribute("src")).toBe("about:blank");
  expect(view.container.querySelector("iframe")).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Close ad" }));
  expect(view.getByTitle("My Mother's Christmas Guest movie").getAttribute("src")).toContain("/embed/VUzt40TJCKM");
});