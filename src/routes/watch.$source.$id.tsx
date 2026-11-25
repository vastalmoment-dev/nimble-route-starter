import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  CaptionsOff,
  ChevronLeft,
  ChevronRight,
  Layers,
  ListVideo,
  Loader2,
  MonitorPlay,
  Play,
  Subtitles,
  X,
} from "lucide-react";
import { z } from "zod";
import { useCallback, useEffect, useRef, useState } from "react";
import { PromoPopup } from "@/components/ads/PromoPopup";
import { DownloadButton } from "@/components/media/DownloadButton";
import VideoPlayer from "@/components/player/VideoPlayer";
import { customStreamUrl, isDirectVideo } from "@/lib/stream/custom-streams";
import { buildAniLastEmbedUrl, getAniLastAnimeStream } from "@/lib/stream/anilast.functions";
import { getMediaStream } from "@/lib/stream/media.functions";
import { inferStreamType, type AudioOption } from "@/lib/stream/resolver";
import { TrailerFrame } from "@/components/player/TrailerFrame";
import { useWatchReturn } from "@/components/player/WatchNavigation";
import { Button } from "@/components/ui/button";
import { detailQuery } from "@/lib/catalog";
import { getTrailer } from "@/lib/catalog/trailer.functions";
import type { Source } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

const SOURCES: Source[] = ["anilist", "tvmaze", "tmdb", "cinemeta"];

export const Route = createFileRoute("/watch/$source/$id")({
  validateSearch: z.object({
    ep: z.coerce.number().int().min(1).catch(1),
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
  const season = search.season ?? 1;
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
  const [includeSubtitles, setIncludeSubtitles] = useState(false);
  const [drawerSeason, setDrawerSeason] = useState(season);

  useEffect(() => {
    setDrawerSeason(season);
  }, [season]);

  useEffect(() => {
    setPlayerMode("native");
  }, [source, id, season, ep, audio]);

  const detail = useQuery(detailQuery(src, id));
  const title = detail.data?.title ?? "";
  const streamUrl = detail.data
    ? customStreamUrl(detail.data.key, detail.data.videoStreamUrl)
    : null;

  const aniStream = useQuery({
    queryKey: ["anime-stream", id, ep, audio],
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

  const inferredMediaType: "movie" | "tv" =
    detail.data?.mediaType ??
    (src === "tvmaze" || id.startsWith("series-") || id.startsWith("tv-") ? "tv" : "movie");
  const rawImdb = detail.data?.imdbId ?? id.match(/(tt\d{5,10})/)?.[1] ?? null;
  const rawTmdb = detail.data?.tmdbId ?? (src === "tmdb" ? id.replace(/^(movie|tv)-/, "") : null);

  const mediaStream = useQuery({
    queryKey: ["media-stream", src, id, inferredMediaType, season, ep, rawImdb, rawTmdb],
    queryFn: () =>
      getMediaStream({
        data: {
          mediaType: inferredMediaType,
          imdbId: rawImdb,
          tmdbId: rawTmdb,
          season: inferredMediaType === "movie" ? 1 : season,
          episode: inferredMediaType === "movie" ? 1 : ep,
        },
      }),
    enabled: !isAnime && !detail.isLoading && !streamUrl && Boolean(rawImdb || rawTmdb),
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
    enabled:
      !isAnime &&
      !detail.isLoading &&
      !streamUrl &&
      !mediaStream.isPending &&
      !mediaStream.data?.ok &&
      !mediaStream.data?.embedUrl,
    staleTime: Infinity,
  });

  const goBack = () => {
    stopPlayback.current?.();
    // YouTube/external iframes create their own history entries; never use browser history length here.
    const sectionRoute = detail.data?.section ? `/${detail.data.section}` : null;
    const fallback =
      sectionRoute ?? (src === "anilist" ? "/anime" : src === "tmdb" ? "/hollywood" : "/");
    void navigate({ href: returnTo.current ?? fallback, replace: true });
  };

  const switchEpisode = (nextEp: number, nextSeason = season) => {
    setEpisodesOpen(false);
    void navigate({
      to: "/watch/$source/$id",
      params: { source, id },
      search: isAnime ? { ep: nextEp, audio } : { season: nextSeason, ep: nextEp },
      replace: true,
    });
  };

  const switchAnimeSeason = (nextId: string) => {
    setEpisodesOpen(false);
    void navigate({
      to: "/watch/$source/$id",
      params: { source: "anilist", id: nextId },
      search: { ep: 1, audio },
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
            provider: "SHADOW Stream",
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
    const relations = detail.data?.relations ?? [];
    const currentEp = episodes.find((e) => e.number === ep);
    const hasPrev = ep > 1;
    const nextSequel = relations.find(
      (r) =>
        r.mediaType !== "movie" &&
        r.status !== "not yet released" &&
        r.status !== "upcoming" &&
        (r.relationType.toLowerCase().includes("sequel") ||
          (r.year != null && detail.data?.year != null && r.year >= detail.data.year)),
    );
    const hasNextInSeason = episodes.length ? ep < episodes.length : true;
    const hasNext = hasNextInSeason || Boolean(nextSequel);
    const nextAction = hasNextInSeason
      ? () => switchEpisode(ep + 1)
      : nextSequel
        ? () => switchAnimeSeason(nextSequel.id)
        : null;
    const nextLabel = hasNextInSeason
      ? `Episode ${ep + 1}`
      : nextSequel
        ? `${nextSequel.title} · Ep 1`
        : null;
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
            onClick={() => nextAction?.()}
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
        <button
          type="button"
          onClick={() => setIncludeSubtitles((s) => !s)}
          title="Choose whether downloaded anime includes subtitle files"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold backdrop-blur-md transition",
            includeSubtitles
              ? "border-cerulean/50 bg-cerulean/15 text-foreground"
              : "border-foreground/15 bg-scrim/75 text-foreground/85 hover:text-foreground",
          )}
        >
          {includeSubtitles ? (
            <>
              <Subtitles className="size-3.5 text-cerulean" />
              <span className="hidden sm:inline">+ Subs</span>
            </>
          ) : (
            <>
              <CaptionsOff className="size-3.5 text-gold" />
              <span className="hidden sm:inline">No Subs</span>
            </>
          )}
        </button>
        <DownloadButton
          item={downloadItem}
          episode={ep}
          audio={audio}
          includeSubtitles={includeSubtitles}
          className="h-9 rounded-full px-3 text-xs [&_svg]:size-3.5"
        />
        {canUseNative && (
          <Button
            type="button"
            variant="glass"
            size="sm"
            className="h-9 rounded-full px-3 text-xs"
            onClick={() => setPlayerMode((m) => (m === "native" ? "embed" : "native"))}
            title={showNative ? "Switch to alternate player" : "Switch back to SHADOW player"}
          >
            <MonitorPlay className="size-3.5" />
            <span className="hidden md:inline">
              {showNative ? "Alternate Player" : "SHADOW Player"}
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
        {relations.length > 0 && (
          <div className="border-b border-foreground/10 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Layers className="size-3.5 text-cerulean" /> All Seasons & Related
            </p>
            <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
              {relations.map((rel) => (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => switchAnimeSeason(rel.id)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-foreground/10 bg-surface/60 px-2.5 py-1.5 text-left text-xs transition hover:border-cerulean/50 hover:bg-surface"
                >
                  <span className="line-clamp-1 font-medium">{rel.title}</span>
                  <span className="shrink-0 text-[10px] font-bold uppercase text-cerulean">
                    {rel.relationType}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-2">
          <ol className="flex flex-col gap-1">
            {(episodes.length
              ? episodes
              : Array.from({ length: Math.max(ep + 5, 12) }, (_, i) => ({
                  id: `${id}-${i + 1}`,
                  number: i + 1,
                }))
            ).map((item) => {
              const active = item.number === ep;
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition",
                    active ? "bg-cerulean/15 ring-1 ring-cerulean/40" : "hover:bg-surface",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => switchEpisode(item.number)}
                    className="flex flex-1 items-center gap-2 text-left font-display text-sm font-semibold tabular-nums"
                  >
                    {active && <Play className="size-3.5 fill-current text-cerulean" />}
                    <span>{item.number}</span>
                  </button>
                  <DownloadButton
                    item={downloadItem}
                    episode={item.number}
                    audio={audio}
                    includeSubtitles={includeSubtitles}
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
            onNext={nextAction}
            nextLabel={nextLabel}
            skipIntroSeconds={85}
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
                Episode {ep} · {audio.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">{animeControls}</div>
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

  if (!isAnime && !streamUrl && (rawImdb || rawTmdb || detail.isLoading)) {
    const isMovie = inferredMediaType === "movie";
    const allEpisodes = detail.data?.episodes ?? [];
    const seasons = detail.data?.seasons?.length
      ? detail.data.seasons
      : [...new Set(allEpisodes.map((e) => e.season ?? 1))].sort((a, b) => a - b);
    const seasonEpisodes =
      seasons.length > 1 ? allEpisodes.filter((e) => (e.season ?? 1) === season) : allEpisodes;
    const drawerEpisodes =
      seasons.length > 1
        ? allEpisodes.filter((e) => (e.season ?? 1) === drawerSeason)
        : allEpisodes;
    const currentIdx = seasonEpisodes.findIndex((e) => e.number === ep);
    const currentEp = currentIdx >= 0 ? seasonEpisodes[currentIdx] : undefined;
    const activeSeasonIdx = seasons.indexOf(season);

    const prevTarget = (() => {
      if (isMovie) return null;
      if (currentIdx > 0) return { season, ep: seasonEpisodes[currentIdx - 1]!.number };
      if (activeSeasonIdx > 0) {
        const prevSeason = seasons[activeSeasonIdx - 1]!;
        const prevEps = allEpisodes.filter((e) => (e.season ?? 1) === prevSeason);
        const lastEp = prevEps[prevEps.length - 1];
        if (lastEp) return { season: prevSeason, ep: lastEp.number };
      }
      if (ep > 1) return { season, ep: ep - 1 };
      return null;
    })();

    const nextTarget = (() => {
      if (isMovie) return null;
      if (currentIdx >= 0 && currentIdx + 1 < seasonEpisodes.length) {
        return { season, ep: seasonEpisodes[currentIdx + 1]!.number };
      }
      if (activeSeasonIdx >= 0 && activeSeasonIdx + 1 < seasons.length) {
        const nextSeason = seasons[activeSeasonIdx + 1]!;
        const nextEps = allEpisodes.filter((e) => (e.season ?? 1) === nextSeason);
        const firstEp = nextEps[0];
        if (firstEp) return { season: nextSeason, ep: firstEp.number };
      }
      if (!seasonEpisodes.length) return { season, ep: ep + 1 };
      return null;
    })();

    const downloadItem = detail.data ?? {
      source: src,
      id,
      title: title || "SHADOW Video",
      imdbId: rawImdb,
      tmdbId: rawTmdb,
      mediaType: inferredMediaType,
    };

    const canUseNative = Boolean(mediaStream.data?.ok && mediaStream.data.streamUrl);
    const showNative = playerMode === "native" && canUseNative;
    const mediaEmbedUrl = mediaStream.data?.embedUrl ?? null;

    const mediaControls = (
      <>
        {!isMovie && (
          <>
            <div className="hidden items-center gap-1 sm:flex">
              <Button
                type="button"
                variant="glass"
                size="round"
                className="size-9"
                disabled={!prevTarget}
                aria-label="Previous episode"
                onClick={() => prevTarget && switchEpisode(prevTarget.ep, prevTarget.season)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="glass"
                size="round"
                className="size-9"
                disabled={!nextTarget}
                aria-label="Next episode"
                onClick={() => nextTarget && switchEpisode(nextTarget.ep, nextTarget.season)}
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
              <span>{seasons.length > 1 ? `S${season} · Ep ${ep}` : `Ep ${ep}`}</span>
              {seasonEpisodes.length > 0 && (
                <span className="text-muted-foreground">/ {seasonEpisodes.length}</span>
              )}
            </Button>
          </>
        )}
        <DownloadButton
          item={downloadItem}
          season={isMovie ? 1 : season}
          episode={isMovie ? 1 : ep}
          className="h-9 rounded-full px-3 text-xs [&_svg]:size-3.5"
        />
        {canUseNative && mediaEmbedUrl && (
          <Button
            type="button"
            variant="glass"
            size="sm"
            className="h-9 rounded-full px-3 text-xs"
            onClick={() => setPlayerMode((m) => (m === "native" ? "embed" : "native"))}
            title={showNative ? "Switch to alternate player" : "Switch back to SHADOW player"}
          >
            <MonitorPlay className="size-3.5" />
            <span className="hidden md:inline">
              {showNative ? "Alternate Player" : "SHADOW Player"}
            </span>
          </Button>
        )}
      </>
    );

    const mediaDrawer = !isMovie && episodesOpen && (
      <aside
        aria-label="Episode selector"
        className="fixed inset-y-0 right-0 z-[55] flex w-80 max-w-full flex-col border-l border-foreground/10 bg-popover/95 shadow-card backdrop-blur-xl"
      >
        <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
          <div>
            <p className="font-display text-sm font-semibold">Episodes</p>
            <p className="text-xs text-muted-foreground">
              {seasons.length > 1
                ? `Season ${drawerSeason} · ${drawerEpisodes.length} episodes`
                : `${drawerEpisodes.length || ep} available`}
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
        {seasons.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-b border-foreground/10 p-3">
            {seasons.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDrawerSeason(s)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                  drawerSeason === s
                    ? "border-cerulean bg-brand-gradient text-primary-foreground"
                    : "border-foreground/10 bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                S{s}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-2">
          <ol className="flex flex-col gap-1">
            {(drawerEpisodes.length
              ? drawerEpisodes
              : Array.from({ length: Math.max(ep + 5, 12) }, (_, i) => ({
                  id: `${id}-${drawerSeason}-${i + 1}`,
                  number: i + 1,
                  season: drawerSeason,
                  title: `Episode ${i + 1}`,
                }))
            ).map((item) => {
              const itemSeason = item.season ?? drawerSeason;
              const active = itemSeason === season && item.number === ep;
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition",
                    active ? "bg-cerulean/15 ring-1 ring-cerulean/40" : "hover:bg-surface",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => switchEpisode(item.number, itemSeason)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                  >
                    {active ? (
                      <Play className="size-3.5 shrink-0 fill-current text-cerulean" />
                    ) : (
                      <span className="w-5 shrink-0 font-display text-xs font-semibold tabular-nums text-muted-foreground">
                        {item.number}
                      </span>
                    )}
                    <span className="truncate font-medium">{item.title}</span>
                  </button>
                  <DownloadButton
                    item={downloadItem}
                    season={itemSeason}
                    episode={item.number}
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

    if (showNative && mediaStream.data?.streamUrl) {
      return (
        <div className="fixed inset-0 z-50 bg-scrim">
          <VideoPlayer
            stream={{
              url: mediaStream.data.streamUrl,
              type: mediaStream.data.type,
              provider: mediaStream.data.provider,
              isDemo: false,
              subtitles: mediaStream.data.subtitles,
            }}
            title={title || "Loading…"}
            subtitle={
              isMovie
                ? "Full Movie"
                : `${seasons.length > 1 ? `Season ${season} · ` : ""}Episode ${ep}${
                    currentEp?.title && currentEp.title !== `Episode ${ep}`
                      ? ` — ${currentEp.title}`
                      : ""
                  }`
            }
            poster={detail.data?.backdrop ?? detail.data?.poster ?? null}
            onBack={goBack}
            onNext={nextTarget ? () => switchEpisode(nextTarget.ep, nextTarget.season) : null}
            nextLabel={
              nextTarget
                ? seasons.length > 1
                  ? `Season ${nextTarget.season} · Ep ${nextTarget.ep}`
                  : `Episode ${nextTarget.ep}`
                : null
            }
            skipIntroSeconds={isMovie ? 90 : 60}
            topRight={mediaControls}
          />
          {mediaDrawer}
        </div>
      );
    }

    if (detail.isLoading || (playerMode === "native" && mediaStream.isPending) || mediaEmbedUrl) {
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
                  {isMovie
                    ? "Full Movie"
                    : `${seasons.length > 1 ? `Season ${season} · ` : ""}Episode ${ep}`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">{mediaControls}</div>
          </div>
          <div className="flex flex-1 items-center justify-center p-2 sm:p-4">
            {detail.isLoading || (playerMode === "native" && mediaStream.isPending) ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <Loader2 className="size-12 animate-spin text-cerulean" />
                <p className="text-sm text-muted-foreground">
                  {isMovie
                    ? "Loading full movie stream…"
                    : `Loading Season ${season} Episode ${ep}…`}
                </p>
              </div>
            ) : mediaEmbedUrl ? (
              <div className="h-full w-full max-w-7xl overflow-hidden rounded-xl border border-foreground/10 bg-background">
                <iframe
                  key={mediaEmbedUrl}
                  src={mediaEmbedUrl}
                  title={
                    isMovie ? `${title || "Movie"}` : `${title || "Series"} — S${season} E${ep}`
                  }
                  className="size-full border-0"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : null}
          </div>
          {mediaDrawer}
        </div>
      );
    }
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
