import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { z } from "zod";
import { useCallback, useEffect, useRef } from "react";
import { PromoPopup } from "@/components/ads/PromoPopup";
import { TrailerFrame } from "@/components/player/TrailerFrame";
import { useWatchReturn } from "@/components/player/WatchNavigation";
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
  const returnTo = useWatchReturn();
  const stopPlayback = useRef<(() => void) | null>(null);
  const registerStop = useCallback((stop: () => void) => {
    stopPlayback.current = stop;
    return () => { if (stopPlayback.current === stop) stopPlayback.current = null; };
  }, []);
  useEffect(() => router.subscribe("onBeforeNavigate", () => stopPlayback.current?.()), [router]);
  const src = source as Source;

  const detail = useQuery(detailQuery(src, id));
  const title = detail.data?.title ?? "";
  const trailer = useQuery({
    queryKey: ["trailer", src, id],
    queryFn: async () => {
      const r = await getTrailer({ data: { source: src, id, title } }).catch(() => ({ youtubeId: null as string | null }));
      if (r.youtubeId || src !== "anilist") return r;
      // Fallback straight from the browser when the host can't run server code.
      try {
        const res = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query: "query($id:Int){Media(id:$id){trailer{id site}}}", variables: { id: Number(id) } }),
        });
        const j = (await res.json()) as { data?: { Media?: { trailer?: { id: string; site: string } | null } } };
        const t = j.data?.Media?.trailer;
        return { youtubeId: t && t.site.toLowerCase() === "youtube" ? t.id : null };
      } catch {
        return r;
      }
    },
    enabled: !detail.isLoading,
    staleTime: Infinity,
  });

  const goBack = () => {
    stopPlayback.current?.();
    // YouTube creates its own history entries; never use browser history length here.
    const fallback = src === "anilist" ? "/anime" : src === "tmdb" ? "/hollywood" : "/";
    void navigate({ href: returnTo.current ?? fallback, replace: true });
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
            {src === "anilist" && <PromoPopup key={id} delay={1500} />}
            <TrailerFrame key={ytId} youtubeId={ytId} title={title} registerStop={registerStop} />
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
