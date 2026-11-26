import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

const LazyWatchlistPage = lazy(() =>
  import("@/components/media/WatchlistPage").then((m) => ({ default: m.WatchlistPage })),
);

function WatchlistRoutePage() {
  return (
    <Suspense fallback={<RouteFallback label="Loading Watchlist…" />}>
      <LazyWatchlistPage />
    </Suspense>
  );
}

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "My Watchlist — SHADOW" },
      {
        name: "description",
        content: "Quickly access your saved anime, cartoons, movies and series on SHADOW.",
      },
      { property: "og:title", content: "My Watchlist — SHADOW" },
      {
        property: "og:description",
        content: "Your personal local watchlist for anime, cartoons, movies and dramas.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: WatchlistRoutePage,
});
