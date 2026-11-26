import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ShowDetailBody } from "@/components/media/ShowDetailBody";
import { Button } from "@/components/ui/button";
import { detailQuery } from "@/lib/catalog";
import { itemKey, type MediaItem, type Source } from "@/lib/catalog/types";
import type { AudioOption } from "@/lib/stream/resolver";

function inferSectionFromId(src: Source, id: string): MediaItem["section"] {
  if (src === "anilist") return "anime";
  if (id.startsWith("movie-")) return "hollywood";
  return "hollywood";
}

export interface TitleDetailPageProps {
  source: Source;
  id: string;
  season?: number | undefined;
  audio?: AudioOption | undefined;
}

export function TitleDetailPage({ source, id, season, audio }: TitleDetailPageProps) {
  const navigate = useNavigate();
  const detail = useQuery(detailQuery(source, id));

  const goHome = () => {
    void navigate({ to: "/" });
  };

  const fallbackItem: MediaItem = detail.data ?? {
    key: itemKey(source, id),
    id,
    source,
    section: inferSectionFromId(source, id),
    title: "Loading title…",
    poster: null,
    genres: [],
    description: "",
    mediaType: source === "anilist" ? "tv" : id.startsWith("movie-") ? "movie" : "tv",
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
        initialSeason={season}
        initialAudio={audio}
        onBack={goHome}
      />
    </div>
  );
}
