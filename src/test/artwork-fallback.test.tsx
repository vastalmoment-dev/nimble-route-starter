import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResilientImage } from "@/components/media/ResilientImage";

afterEach(cleanup);

describe("Catalog image recovery", () => {
  it("tries alternate artwork before giving up on a failed source", () => {
    const view = render(<ResilientImage src="/poster.jpg" alternatives={["/poster-hd.jpg"]} fallbackLabel="Iron Man" alt="Iron Man" />);
    fireEvent.error(view.getByRole("img"));
    expect(view.getByRole("img").getAttribute("src")).toBe("/poster-hd.jpg");
    fireEvent.error(view.getByRole("img"));
    expect(view.container.querySelector("img")).toBeNull();
  });

  it("allows a new image source after a previous title's source failed", () => {
    const view = render(<ResilientImage src="/first.jpg" fallbackLabel="First" alt="First" />);
    fireEvent.error(view.getByRole("img"));
    view.rerender(<ResilientImage src="/second.jpg" fallbackLabel="Second" alt="Second" />);
    expect(view.getByRole("img").getAttribute("src")).toBe("/second.jpg");
  });
});