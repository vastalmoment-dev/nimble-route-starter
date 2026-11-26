import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ShowDetailBody } from "@/components/media/ShowDetailBody";
import { Button } from "@/components/ui/button";
import { detailQuery } from "@/lib/catalog";
import { itemKey, type MediaItem, type Source } from "@/lib/catalog/types";
import type { AudioOption } from "@/lib/stream/resolver";

const SOURCES: Source[] = ["anilist", "tvmaze", "tmdb", "cinemeta"];

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
  component: TitleDetailPage,
});

function inferSectionFromId(src: Source, id: string): MediaItem["section"] {
  if (src === "anilist") return "anime";
  if (id.startsWith("movie-")) return "hollywood";
  return "hollywood";
}

function TitleDetailPage() {
  const { source, id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const src = source as Source;
  const detail = useQuery(detailQuery(src, id));

  const goHome = () => {
    void navigate({ to: "/" });
  };

  const fallbackItem: MediaItem = detail.data ?? {
    key: itemKey(src, id),
    id,
    source: src,
    section: inferSectionFromId(src, id),
    title: "Loading title…",
    poster: null,
    genres: [],
    description: "",
    mediaType: src === "anilist" ? "tv" : id.startsWith("movie-") ? "movie" : "tv",
  };

  if (detail.isLoading && !detail.data) {
    return (
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-8">
        <Button
          type="button"
          variant="glass"
          size="sm"
          onClick={goHome}
          aria-label="Back to Home"
          className="mb-6 gap-2 rounded-full px-4"
        >
          <ArrowLeft className="size-4" />
          <span>Back to Home</span>
        </Button>
        <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="size-10 animate-spin text-cerulean" />
          <p className="text-sm text-muted-foreground">Loading seasons and episodes…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-8">
      <ShowDetailBody
        item={fallbackItem}
        mode="page"
        initialSeason={search.season}
        initialAudio={search.audio}
        onBack={goHome}
      />
    </div>
  );
}
