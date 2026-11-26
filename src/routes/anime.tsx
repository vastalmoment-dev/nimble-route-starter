import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazySectionPage = lazy(() =>
  import("@/components/media/SectionPage").then((m) => ({ default: m.SectionPage })),
);
const LazyAnimeCatalogGrid = lazy(() =>
  import("@/components/media/AnimeCatalogGrid").then((m) => ({ default: m.AnimeCatalogGrid })),
);

function AnimeRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Anime…" />}>
      <LazySectionPage
        section="anime"
        renderAfterShelves={(genres) => (
          <Suspense fallback={null}>
            <LazyAnimeCatalogGrid genres={genres} />
          </Suspense>
        )}
      />
    </Suspense>
  );
}

export const Route = createFileRoute("/anime")({
  head: () => ({
    meta: [
      { title: "Anime — SHADOW" },
      {
        name: "description",
        content:
          "Trending, newly released, top-rated and all anime with full episodes, Sub/Dub playback and downloads.",
      },
      { property: "og:title", content: "Anime — SHADOW" },
      {
        property: "og:description",
        content:
          "Trending, newly released, top-rated and all anime with full episodes, Sub/Dub playback and downloads.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnimeRoutePage,
});
