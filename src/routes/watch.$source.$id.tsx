import { createFileRoute, notFound } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { z } from "zod";
import type { Source } from "@/lib/catalog/types";

const SOURCES: Source[] = ["anilist", "tvmaze", "tmdb", "cinemeta"];

const LazyWatchPage = lazy(() =>
  import("@/components/player/WatchPage").then((m) => ({ default: m.WatchPage })),
);

function WatchRoutePage() {
  const { source, id } = Route.useParams();
  const search = Route.useSearch();
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim">
          <Loader2 className="size-12 animate-spin text-cerulean" />
        </div>
      }
    >
      <LazyWatchPage
        source={source as Source}
        id={id}
        ep={search.ep}
        season={search.season}
        audio={search.audio}
      />
    </Suspense>
  );
}

export const Route = createFileRoute("/watch/$source/$id")({
  validateSearch: z.object({
    ep: z.coerce.number().int().min(1).catch(1).optional(),
    season: z.coerce.number().int().min(1).catch(1).optional(),
    audio: z.enum(["sub", "dub"]).catch("sub").optional(),
  }),
  beforeLoad: ({ params }) => {
    if (!SOURCES.includes(params.source as Source)) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Watch — SHADOW" },
      { name: "description", content: "Stream full movies, shows and anime on SHADOW." },
      { property: "og:title", content: "Watch — SHADOW" },
      {
        property: "og:description",
        content: "Stream full movies, cartoons and anime episodes on SHADOW.",
      },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WatchRoutePage,
});
