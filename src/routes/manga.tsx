import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazyMangaPage = lazy(() =>
  import("@/components/media/MangaPage").then((m) => ({ default: m.MangaPage })),
);

function MangaRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Manga…" />}>
      <LazyMangaPage />
    </Suspense>
  );
}

export const Route = createFileRoute("/manga")({
  head: () => ({
    meta: [
      { title: "Free Manga to Read & Download — SHADOW" },
      {
        name: "description",
        content:
          "Read and download free manga chapters in CBZ format on SHADOW. Newly released manga and chapters appear automatically.",
      },
      { property: "og:title", content: "Free Manga to Read & Download — SHADOW" },
      {
        property: "og:description",
        content:
          "Free auto-updating manga library with online chapter reader and instant CBZ downloads.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MangaRoutePage,
});
