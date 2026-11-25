import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ListVideo,
  Loader2,
  MonitorPlay,
  Play,
  X,
} from "lucide-react";
import { z } from "zod";
import { useCallback, useEffect, useRef, useState } from "react";
import { PromoPopup } from "@/components/ads/PromoPopup";
import { DownloadButton } from "@/components/media/DownloadButton";
import VideoPlayer from "@/components/player/VideoPlayer";
import { customStreamUrl, isDirectVideo } from "@/lib/stream/custom-streams";
import { buildAniLastEmbedUrl, getAniLastAnimeStream } from "@/lib/stream/anilast.functions";
import { inferStreamType, type AudioOption } from "@/lib/stream/resolver";
import { TrailerFrame } from "@/components/player/TrailerFrame";
import { useWatchReturn } from "@/components/player/WatchNavigation";
import { Button } from "@/components/ui/button";
import { detailQuery } from "@/lib/catalog";
import { getTrailer } from "@/lib/catalog/trailer.functions";
import type { Source } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

const SOURCES: Source[] = ["anilist", "tvmaze", "tmdb"];

export const Route = createFileRoute("/watch/$source/$id")({
  validateSearch: z.object({
    ep: z.coerce.number().int().min(1).catch(1),
    audio: z.enum(["sub", "dub"]).catch("sub").optional(),
  }),
  beforeLoad: ({ params }) => {
    if (!SOURCES.includes(params.source as Source)) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Watch — SHADOW" },
      { name: "description", content: "Stream full episodes and trailers on SHADOW." },
      { property: "og:title", content: "Watch — SHADOW" },
      {
        property: "og:description",
        content: "Stream anime episodes with Sub/Dub and official trailers on SHADOW.",
      },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WatchPage,
});

function AudioToggle({
  value,
  onChange,
}: {
  value: AudioOption;
  onChange: (next: AudioOption) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Audio track"
      className="inline-flex h-9 items-center rounded-full border border-foreground/15 bg-scrim/75 p-0.5 backdrop-blur-md"
    >
      {(["sub", "dub"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition",
            value === opt
              ? "bg-brand-gradient text-primary-foreground shadow-sm"
              : "text-foreground/75 hover:text-foreground",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function WatchPage() {
  const { source, id } = Route.useParams();
  const search = Route.useSearch();
  const ep = search.ep;
  const audio: AudioOption = search.audio ?? "sub";
  const navigate = useNavigate();
  const router = useRouter();
  const returnTo = useWatchReturn();
  const stopPlayback = useRef<(() => void) | null>(null);
  const registerStop = useCallback((stop: () => void) => {
    stopPlayback.current = stop;
    return () => {
      if (stopPlayback.current === stop) stopPlayback.current = null;
    };
  }, []);
  useEffect(() => router.subscribe("onBeforeNavigate", () => stopPlayback.current?.()), [router]);
  const src = source as Source;
  const isAnime = src === "anilist";

  const [playerMode, setPlayerMode] = useState<"native" | "embed">("native");
  const [episodesOpen, setEpisodesOpen] = useState(false);

  const detail = useQuery(detailQuery(src, id));
  const title = detail.data?.title ?? "";
  const streamUrl = detail.data
    ? customStreamUrl(detail.data.key, detail.data.videoStreamUrl)
    : null;

  const aniStream = useQuery({
    queryKey: ["anilast-stream", id, ep, audio],
    queryFn: () =>
      getAniLastAnimeStream({
        data: {
          anilistId: id,
          malId: detail.data?.malId ?? null,
          episode: ep,
          audio,
          title: detail.data?.title ?? null,
          englishTitle: detail.data?.englishTitle ?? null,
          romajiTitle: detail.data?.romajiTitle ?? null,
        },
      }),
    enabled: isAnime && !detail.isLoading && !streamUrl,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const trailer = useQuery({
    queryKey: ["trailer", src, id],
    queryFn: async () => {
      const r = await getTrailer({ data: { source: src, id, title } }).catch(() => ({
        youtubeId: null as string | null,
      }));
      if (r.youtubeId || src !== "anilist") return r;
      // Fallback straight from the browser when the host can't run server code.
      try {
        const res = await fetch("https://graphql.anilist.co", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            query: "query($id:Int){Media(id:$id){trailer{id site}}}",
            variables: { id: Number(id) },
          }),
        });
        const j = (await res.json()) as {
          data?: { Media?: { trailer?: { id: string; site: string } | null } };
        };
        const t = j.data?.Media?.trailer;
        return { youtubeId: t && t.site.toLowerCase() === "youtube" ? t.id : null };
      } catch {
        return r;
      }
    },
    enabled: !isAnime && !detail.isLoading && !streamUrl,
    staleTime: Infinity,
  });

  const goBack = () => {
    stopPlayback.current?.();
    // YouTube/external iframes create their own history entries; never use browser history length here.
    const fallback = src === "anilist" ? "/anime" : src === "tmdb" ? "/hollywood" : "/";
    void navigate({ href: returnTo.current ?? fallback, replace: true });
  };

  const switchEpisode = (nextEp: number) => {
    setEpisodesOpen(false);
    void navigate({
      to: "/watch/$source/$id",
      params: { source, id },
      search: isAnime ? { ep: nextEp, audio } : { ep: nextEp },
      replace: true,
    });
  };

  const switchAudio = (nextAudio: AudioOption) => {
    if (nextAudio === audio) return;
    void navigate({
      to: "/watch/$source/$id",
      params: { source, id },
      search: { ep, audio: nextAudio },
      replace: true,
    });
  };

  if (streamUrl && isDirectVideo(streamUrl)) {
    return (
      <div className="fixed inset-0 z-50 bg-scrim">
        <VideoPlayer
          stream={{
            url: streamUrl,
            type: inferStreamType(streamUrl),
            provider: "Custom stream",
            isDemo: false,
          }}
          title={title}
          poster={detail.data?.backdrop ?? detail.data?.poster ?? null}
          onBack={goBack}
        />
      </div>
    );
  }

  if (isAnime && !streamUrl) {
    const episodes = detail.data?.episodes ?? [];
    const currentEp = episodes.find((e) => e.number === ep);
    const hasPrev = ep > 1;
    const hasNext = episodes.length ? ep < episodes.length : true;
    const downloadItem = detail.data ?? {
      source: "anilist" as const,
      id,
      title: title || `Anime ${id}`,
    };
    const canUseNative = Boolean(aniStream.data?.ok && aniStream.data.streamUrl);
    const showNative = playerMode === "native" && canUseNative;
    const embedUrl =
      aniStream.data?.embedUrl ??
      buildAniLastEmbedUrl({
        anilistId: id,
        episode: ep,
        audio,
        title: title || null,
        malId: detail.data?.malId ?? null,
      });

    const animeControls = (
      <>
        <AudioToggle value={audio} onChange={switchAudio} />
        <div className="hidden items-center gap-1 sm:flex">
          <Button
            type="button"
            variant="glass"
            size="round"
            className="size-9"
            disabled={!hasPrev}
            aria-label="Previous episode"
            onClick={() => switchEpisode(ep - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="glass"
            size="round"
            className="size-9"
            disabled={!hasNext}
            aria-label="Next episode"
            onClick={() => switchEpisode(ep + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button
          type="button"
          variant="glass"
          size="sm"
          className="h-9 rounded-full px-3 text-xs"
          onClick={() => setEpisodesOpen((o) => !o)}
        >
          <ListVideo className="size-3.5" />
          <span>Ep {ep}</span>
          {episodes.length > 0 && (
            <span className="text-muted-foreground">/ {episodes.length}</span>
          )}
        </Button>
        <DownloadButton
          item={downloadItem}
          episode={ep}
          audio={audio}
          className="h-9 rounded-full px-3 text-xs [&_svg]:size-3.5"
        />
        {canUseNative && (
          <Button
            type="button"
            variant="glass"
            size="sm"
            className="h-9 rounded-full px-3 text-xs"
            onClick={() => setPlayerMode((m) => (m === "native" ? "embed" : "native"))}
            title={
              showNative
                ? "Switch to AniLast embedded player"
                : "Switch back to built-in SHADOW player"
            }
          >
            <MonitorPlay className="size-3.5" />
            <span className="hidden md:inline">
              {showNative ? "AniLast Embed" : "SHADOW Player"}
            </span>
          </Button>
        )}
      </>
    );

    const episodeDrawer = episodesOpen && (
      <aside
        aria-label="Episode selector"
        className="fixed inset-y-0 right-0 z-[55] flex w-80 max-w-full flex-col border-l border-foreground/10 bg-popover/95 shadow-card backdrop-blur-xl"
      >
        <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
          <div>
            <p className="font-display text-sm font-semibold">Episodes</p>
            <p className="text-xs text-muted-foreground">
              Audio: {audio.toUpperCase()} · {episodes.length || ep} available
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="round"
            className="size-8"
            aria-label="Close episodes"
            onClick={() => setEpisodesOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <ol className="space-y-1">
            {(episodes.length
              ? episodes
              : Array.from({ length: Math.max(ep + 5, 12) }, (_, i) => ({
                  id: `${id}-${i + 1}`,
                  number: i + 1,
                  title: `Episode ${i + 1}`,
                }))
            ).map((item) => {
              const active = item.number === ep;
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg p-2 transition",
                    active ? "bg-cerulean/15 ring-1 ring-cerulean/40" : "hover:bg-surface",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => switchEpisode(item.number)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md font-display text-xs font-semibold",
                        active
                          ? "bg-brand-gradient text-primary-foreground"
                          : "bg-surface text-muted-foreground",
                      )}
                    >
                      {active ? <Play className="size-3 fill-current" /> : item.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {item.title}
                    </span>
                  </button>
                  <DownloadButton
                    item={downloadItem}
                    episode={item.number}
                    audio={audio}
                    variant="icon"
                    compact
                  />
                </li>
              );
            })}
          </ol>
        </div>
      </aside>
    );

    if (showNative && aniStream.data?.streamUrl) {
      return (
        <div className="fixed inset-0 z-50 bg-scrim">
          <VideoPlayer
            stream={{
              url: aniStream.data.streamUrl,
              type: aniStream.data.type,
              provider: aniStream.data.provider,
              isDemo: false,
              subtitles: aniStream.data.subtitles,
            }}
            title={title || "Loading…"}
            subtitle={`Episode ${ep} · ${audio.toUpperCase()}${
              currentEp?.title && currentEp.title !== `Episode ${ep}` ? ` — ${currentEp.title}` : ""
            }`}
            poster={detail.data?.backdrop ?? detail.data?.poster ?? null}
            onBack={goBack}
            onNext={hasNext ? () => switchEpisode(ep + 1) : null}
            topRight={animeControls}
          />
          {episodeDrawer}
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/5 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="glass" size="round" aria-label="Back" onClick={goBack}>
              <ArrowLeft className="size-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold">{title || "Loading…"}</p>
              <p className="text-xs text-muted-foreground">
                Episode {ep} · {audio.toUpperCase()} · AniLast
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {animeControls}
            <Button asChild variant="glass" size="sm" className="h-9 rounded-full px-3 text-xs">
              <a href={embedUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
                <span className="hidden sm:inline">Open on AniLast</span>
              </a>
            </Button>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-2 sm:p-4">
          {detail.isLoading || (playerMode === "native" && aniStream.isPending) ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="size-12 animate-spin text-cerulean" />
              <p className="text-sm text-muted-foreground">
                Loading {audio.toUpperCase()} stream for Episode {ep}…
              </p>
            </div>
          ) : (
            <div className="h-full w-full max-w-7xl overflow-hidden rounded-xl border border-foreground/10 bg-background">
              <iframe
                key={embedUrl}
                src={embedUrl}
                title={`${title || "Anime"} — Episode ${ep} (${audio.toUpperCase()})`}
                className="size-full border-0"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}
        </div>
        {episodeDrawer}
      </div>
    );
  }

  const ytId = trailer.data?.youtubeId;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
      <div className="flex items-center gap-3 p-4">
        <Button variant="glass" size="round" aria-label="Back" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold">{title || "Loading…"}</p>
          <p className="text-xs text-muted-foreground">
            {streamUrl ? "Now playing" : "Official trailer"}
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-6">
        {detail.isLoading ? (
          <Loader2 className="size-12 animate-spin text-cerulean" />
        ) : streamUrl ? (
          <div className="aspect-video w-full max-w-6xl overflow-hidden rounded-xl">
            <iframe
              key={streamUrl}
              src={streamUrl}
              title={title}
              className="size-full"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : trailer.isPending ? (
          <Loader2 className="size-12 animate-spin text-cerulean" />
        ) : ytId ? (
          <div className="aspect-video w-full max-w-6xl overflow-hidden rounded-xl">
            <PromoPopup key={id} delay={1500} />
            <TrailerFrame key={ytId} youtubeId={ytId} title={title} registerStop={registerStop} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="font-display text-xl font-semibold">
              No trailer is available for this title yet.
            </p>
            <Button variant="glass" size="xl" onClick={goBack}>
              Go back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
