import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { RouteFallback } from "@/components/layout/RouteFallback";
import type { Source } from "@/lib/catalog/types";
import type { AudioOption } from "@/lib/stream/resolver";

const SOURCES: Source[] = ["anilist", "tvmaze", "tmdb", "cinemeta"];

const LazyTitleDetailPage = lazy(() =>
  import("@/components/media/TitleDetailPage").then((m) => ({ default: m.TitleDetailPage })),
);

function parseTitleSearch(raw: Record<string, unknown> | undefined): {
  season?: number | undefined;
  audio?: AudioOption | undefined;
} {
  const s = Number(raw?.["season"]);
  const season = Number.isInteger(s) && s >= 1 ? s : undefined;
  const a = raw?.["audio"];
  const audio: AudioOption | undefined = a === "sub" || a === "dub" ? a : undefined;
  return {
    ...(season !== undefined ? { season } : {}),
    ...(audio !== undefined ? { audio } : {}),
  };
}

function TitleDetailRoutePage() {
  const { source, id } = Route.useParams();
  const search = Route.useSearch();
  return (
    <Suspense fallback={<RouteFallback label="Loading title details…" />}>
      <LazyTitleDetailPage
        source={source as Source}
        id={id}
        season={search.season}
        audio={search.audio}
      />
    </Suspense>
  );
}

export const Route = createFileRoute("/title/$source/$id")({
  validateSearch: (raw) => parseTitleSearch(raw),
  beforeLoad: ({ params }) => {
    if (!SOURCES.includes(params.source as Source)) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Show Details — SHADOW" },
      {
        name: "description",
        content: "Browse seasons, episodes, trailers and downloads on SHADOW.",
      },
      { property: "og:type", content: "video.tv_show" },
    ],
  }),
  component: TitleDetailRoutePage,
});
