import { useQuery } from "@tanstack/react-query";
import { ClientOnly, createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { Loader2, X } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { z } from "zod";
import { AdSlot } from "@/components/ads/AdSlot";
import { DownloadButton } from "@/components/media/DownloadButton";
import { Button } from "@/components/ui/button";
import { detailQuery } from "@/lib/catalog";
import type { Source } from "@/lib/catalog/types";
import { resolveStream } from "@/lib/stream/resolver";

const VideoPlayer = lazy(() => import("@/components/player/VideoPlayer"));
const SOURCES: Source[] = ["anilist", "tvmaze", "tmdb"];

export const Route = createFileRoute("/watch/$source/$id")({
  validateSearch: z.object({ ep: z.coerce.number().int().min(1).catch(1) }),
  beforeLoad: ({ params }) => {
    if (!SOURCES.includes(params.source as Source)) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Now playing — SHADOW" },
      { name: "description", content: "Watch on SHADOW with adaptive streaming, quality controls and offline downloads." },
      { property: "og:title", content: "Now playing — SHADOW" },
      { property: "og:description", content: "Adaptive streaming with full playback controls on SHADOW." },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WatchPage,
});

function Spinner() {
  return (
    <div className="flex size-full items-center justify-center">
      <Loader2 className="size-12 animate-spin text-cerulean" />
    </div>
  );
}

function WatchPage() {
  const { source, id } = Route.useParams();
  const { ep } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const src = source as Source;
  const [adClosed, setAdClosed] = useState(false);

  const detail = useQuery(detailQuery(src, id));
  const title = detail.data?.title ?? "";
  const stream = useQuery({
    queryKey: ["stream", src, id, ep],
    queryFn: () => resolveStream({ source: src, id, episode: ep, title }),
    staleTime: Infinity,
  });

  const episodes = detail.data?.episodes ?? [];
  const current = episodes.find((e) => e.number === ep);
  const hasNext = episodes.some((e) => e.number === ep + 1);
  const subtitle = [current?.title ?? (episodes.length > 1 ? `Episode ${ep}` : null), stream.data?.isDemo ? stream.data.provider : null]
    .filter(Boolean)
    .join("  ·  ");

  const goBack = () => {
    if (window.history.length > 1) router.history.back();
    else void navigate({ to: "/" });
  };

  return (
    <div className="fixed inset-0 z-50 bg-scrim">
      {stream.isError ? (
        <div className="flex size-full flex-col items-center justify-center gap-4 text-center">
          <p className="font-display text-xl font-semibold">No stream is available for this title yet.</p>
          <Button variant="glass" size="xl" onClick={goBack}>
            Go back
          </Button>
        </div>
      ) : stream.data ? (
        <ClientOnly fallback={<Spinner />}>
          <Suspense fallback={<Spinner />}>
            <VideoPlayer
              stream={stream.data}
              title={title || "Loading…"}
              subtitle={subtitle || null}
              poster={detail.data?.backdrop ?? null}
              onBack={goBack}
              onNext={hasNext ? () => void navigate({ to: "/watch/$source/$id", params: { source, id }, search: { ep: ep + 1 } }) : null}
              pausedOverlay={
                <div className="absolute bottom-28 right-4 flex flex-col items-end gap-3 sm:right-6">
                  {title && <DownloadButton item={{ source: src, id, title }} episode={ep} />}
                  {!adClosed && (
                    <div className="relative hidden rounded-xl border border-foreground/10 bg-popover/80 p-2 backdrop-blur-xl sm:block">
                      <button
                        type="button"
                        aria-label="Close ad"
                        onClick={() => setAdClosed(true)}
                        className="absolute -right-2 -top-2 z-10 rounded-full border bg-popover p-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                      <AdSlot slot="player-companion" />
                    </div>
                  )}
                </div>
              }
            />
          </Suspense>
        </ClientOnly>
      ) : (
        <Spinner />
      )}
    </div>
  );
}
