import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadButton } from "@/components/media/DownloadButton";
import { MediaModalProvider } from "@/components/media/MediaModalContext";
import { NollywoodPage } from "@/components/media/NollywoodPage";
import type { SectionCatalog } from "@/lib/catalog/types";

const SAMPLE_CATALOG: SectionCatalog = {
  section: "nollywood",
  provider: "SHADOW Live Catalog",
  featured: [
    {
      key: "cinemeta:movie-tt24083908",
      id: "movie-tt24083908",
      source: "cinemeta",
      section: "nollywood",
      title: "The Black Book",
      poster: "https://images.metahub.space/poster/medium/tt24083908/img",
      posterHd: "https://images.metahub.space/poster/large/tt24083908/img",
      backdrop: "https://images.metahub.space/background/medium/tt24083908/img",
      year: 2023,
      rating: 7.4,
      genres: ["Crime", "Thriller"],
      description: "After his son is framed for a kidnapping, a deacon seeks justice.",
      imdbId: "tt24083908",
      mediaType: "movie",
    },
  ],
  shelves: [
    {
      id: "new-releases",
      title: "New in Nollywood",
      items: [
        {
          key: "cinemeta:movie-tt34573436",
          id: "movie-tt34573436",
          source: "cinemeta",
          section: "nollywood",
          title: "Everybody Loves Jenifa",
          poster: "https://images.metahub.space/poster/medium/tt34573436/img",
          year: 2024,
          rating: 7.1,
          genres: ["Comedy"],
          description: "Jenifa faces new neighborhood challenges.",
          imdbId: "tt34573436",
          mediaType: "movie",
        },
        {
          key: "cinemeta:movie-tt24083908",
          id: "movie-tt24083908",
          source: "cinemeta",
          section: "nollywood",
          title: "The Black Book",
          poster: "https://images.metahub.space/poster/medium/tt24083908/img",
          year: 2023,
          rating: 7.4,
          genres: ["Crime", "Thriller"],
          description: "After his son is framed for a kidnapping, a deacon seeks justice.",
          imdbId: "tt24083908",
          mediaType: "movie",
        },
      ],
    },
  ],
  items: [],
};

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => ({
      data: SAMPLE_CATALOG,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      isFetching: false,
    }),
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: unknown }) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("Nollywood non-YouTube streaming & downloads", () => {
  it("renders multi-provider Nollywood catalog without any YouTube embeds", () => {
    const view = render(
      <MediaModalProvider>
        <NollywoodPage />
      </MediaModalProvider>,
    );

    expect(screen.getByRole("heading", { name: "Nollywood" })).toBeTruthy();
    expect(screen.getByText("New in Nollywood")).toBeTruthy();
    expect(screen.getByText("Everybody Loves Jenifa")).toBeTruthy();
    expect(view.container.querySelector("iframe")).toBeNull();
    expect(view.container.innerHTML.toLowerCase()).not.toContain("youtube");
  });

  it("exposes direct movie download for Nollywood titles", () => {
    render(
      <DownloadButton
        item={{
          source: "cinemeta",
          id: "movie-tt24083908",
          title: "The Black Book",
          imdbId: "tt24083908",
          mediaType: "movie",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /Download Movie/i })).toBeTruthy();
  });
});
