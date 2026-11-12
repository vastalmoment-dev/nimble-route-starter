import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { detailQuery } from "@/lib/catalog";
import { getTrailer } from "@/lib/catalog/trailer.functions";
import type { Source } from "@/lib/catalog/types";

const SOURCES: Source[] = ["anilist", "tvmaze", "tmdb"];

export const Route = createFileRoute("/watch/$source/$id")({
  validateSearch: z.object({ ep: z.coerce.number().int().min(1).catch(1) }),
  beforeLoad: ({ params }) => {
    if (!SOURCES.includes(params.source as Source)) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Official trailer — SHADOW" },
      { name: "description", content: "Watch the official trailer on SHADOW." },
      { property: "og:title", content: "Official trailer — SHADOW" },
      { property: "og:description", content: "Official trailers for anime, K-dramas, movies and more on SHADOW." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WatchPage,
});

function WatchPage() {
  const { source, id } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const src = source as Source;

  const detail = useQuery(detailQuery(src, id));
  const title = detail.data?.title ?? "";
  const trailer = useQuery({
    queryKey: ["trailer", src, id],
    queryFn: () => getTrailer({ data: { source: src, id, title } }),
    enabled: !detail.isLoading,
    staleTime: Infinity,
  });

  const goBack = () => {
    if (window.history.length > 1) router.history.back();
    else void navigate({ to: "/" });
  };

  const ytId = trailer.data?.youtubeId;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
      <div className="flex items-center gap-3 p-4">
        <Button variant="glass" size="round" aria-label="Back" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold">{title || "Loading…"}</p>
          <p className="text-xs text-muted-foreground">Official trailer</p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-6">
        {trailer.isPending || detail.isLoading ? (
          <Loader2 className="size-12 animate-spin text-cerulean" />
        ) : ytId ? (
          <div className="aspect-video w-full max-w-6xl overflow-hidden rounded-xl">
            <iframe
              className="size-full"
              src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0`}
              title={`${title} trailer`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="font-display text-xl font-semibold">No trailer is available for this title yet.</p>
            <Button variant="glass" size="xl" onClick={goBack}>
              Go back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
