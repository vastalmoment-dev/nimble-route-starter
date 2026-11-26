import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";

interface SearchParams {
  q?: string | undefined;
  genres?: string | undefined;
}

function parseSearchParams(raw: Record<string, unknown>): SearchParams {
  const qRaw = raw?.["q"];
  const genresRaw = raw?.["genres"];
  const q =
    typeof qRaw === "string"
      ? qRaw
      : typeof qRaw === "number" || typeof qRaw === "boolean"
        ? String(qRaw)
        : undefined;
  const genres = typeof genresRaw === "string" ? genresRaw : undefined;
  return {
    ...(q !== undefined ? { q } : {}),
    ...(genres !== undefined ? { genres } : {}),
  };
}

const LazySearchPage = lazy(() =>
  import("@/components/media/SearchPage").then((m) => ({ default: m.SearchPage })),
);

function SearchRoutePage() {
  const search = Route.useSearch();
  return (
    <Suspense fallback={<RouteFallback label="Loading search…" />}>
      <LazySearchPage q={search.q} genres={search.genres} />
    </Suspense>
  );
}

export const Route = createFileRoute("/search")({
  validateSearch: parseSearchParams,
  head: () => ({
    meta: [
      { title: "Search — SHADOW" },
      {
        name: "description",
        content:
          "Search anime, K-dramas, Hollywood, Bollywood/Tollywood and cartoons in real time.",
      },
      { property: "og:title", content: "Search — SHADOW" },
      { property: "og:description", content: "Find your next watch across every SHADOW genre." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex, follow" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchRoutePage,
});
