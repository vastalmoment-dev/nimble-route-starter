import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
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
  RefreshCw,
  Subtitles,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { DownloadButton } from "@/components/media/DownloadButton";
import { LanguageToggle } from "@/components/media/LanguageToggle";
import { Button } from "@/components/ui/button";
import { detailQuery } from "@/lib/catalog";
import { getTrailer } from "@/lib/catalog/trailer.functions";
import type { Source } from "@/lib/catalog/types";
import { useT } from "@/lib/i18n";
import { playbackProgress } from "@/lib/player/progress";
import { buildAnimeEmbedFallbacks, getAniLastAnimeStream } from "@/lib/stream/anilast.functions";
import { customStreamUrl, isDirectVideo } from "@/lib/stream/custom-streams";
import { buildMediaEmbedFallbacks, getMediaStream } from "@/lib/stream/media.functions";
import { inferStreamType, type AudioOption } from "@/lib/stream/resolver";
import { cn } from "@/lib/utils";

const LazyVideoPlayer = lazy(() => import("@/components/player/VideoPlayer"));
const LazyTrailerFrame = lazy(() =>
  import("@/components/player/TrailerFrame").then((m) => ({ default: m.TrailerFrame })),
);

const DISCORD_URL = "https://discord.gg/uKtF6Efs2";

function WatchDiscordPrompt() {
  const { t } = useT();
  return (
    <div className="shrink-0 border-t border-foreground/10 bg-background/95 px-3 py-1.5 text-center text-xs text-muted-foreground backdrop-blur-md">
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 leading-snug">
        <span>{t("watch.discordPrompt")}</span>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center font-semibold text-cerulean underline decoration-cerulean/50 underline-offset-4 transition hover:text-foreground hover:decoration-foreground sm:min-h-0"
        >
          {t("watch.discordCta")}
        </a>
      </p>
    </div>
  );
}

function PlayerSpinner() {
  return (
    <div className="flex size-full items-center justify-center bg-scrim">
      <Loader2 className="size-12 animate-spin text-cerulean" />
    </div>
  );
}

function AudioToggle({
  value,
  onChange,
}: {
  value: AudioOption;
  onChange: (next: AudioOption) => void;
}) {
  const { t } = useT();
  return (
    <div
      role="group"
      aria-label={t("watch.audioTrack")}
      className="inline-flex min-h-[44px] items-center rounded-full border border-foreground/15 bg-scrim/75 p-0.5 backdrop-blur-md sm:min-h-9"
    >
      {(["sub", "dub"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "min-h-[38px] rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition sm:min-h-0",
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

export interface WatchPageProps {
  source: Source;
  id: string;
  ep?: number | undefined;
  season?: number | undefined;
  audio?: AudioOption | undefined;
}

export function WatchPage({
  source,
  id,
  ep: searchEp,
  season: searchSeason,
  audio: searchAudio,
}: WatchPageProps) {
  const isAnime = source === "anilist";
  const { lang, t } = useT();

  const lastWatched =
    typeof window !== "undefined" ? playbackProgress.getLastWatched(source, id) : null;
  const ep = searchEp ?? lastWatched?.episode ?? 1;
  const season = searchSeason ?? lastWatched?.season ?? 1;
  const audio: AudioOption = searchAudio ?? lastWatched?.audio ?? "sub";

  const navigate = useNavigate();
  const router = useRouter();
  const stopPlayback = useRef<(() => void) | null>(null);
  const registerStop = useCallback((stop: () => void) => {
    stopPlayback.current = stop;
    return () => {
      if (stopPlayback.current === stop) stopPlayback.current = null;
    };
  }, []);
  useEffect(() => router.subscribe("onBeforeNavigate", () => stopPlayback.current?.()), [router]);

  const [playerMode, setPlayerMode] = useState<"native" | "embed">(() =>
    isAnime ? "native" : "embed",
  );
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);
  const [embedIndex, setEmbedIndex] = useState(0);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [includeSubtitles, setIncludeSubtitles] = useState(false);
  const [drawerSeason, setDrawerSeason] = useState(season);

  const liveProgressRef = useRef<{ time: number; duration: number }>({ time: 0, duration: 0 });
  const carryOverRef = useRef<{ epKey: string; time: number } | null>(null);
  const epKey = `${source}:${id}:s${season}:e${ep}`;

  const [resumeTime, setResumeTime] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return playbackProgress.get(source, id, season, ep)?.currentTime ?? 0;
  });

  useEffect(() => {
    setDrawerSeason(season);
  }, [season]);

  useEffect(() => {
    setPlayerMode(isAnime ? "native" : "embed");
    setSelectedSourceIndex(0);
    setEmbedIndex(0);
    if (carryOverRef.current && carryOverRef.current.epKey === epKey) {
      setResumeTime(carryOverRef.current.time);
      carryOverRef.current = null;
      return;
    }
    const saved = playbackProgress.get(source, id, season, ep);
    const t = saved?.currentTime ?? 0;
    liveProgressRef.current = { time: t, duration: saved?.duration ?? 0 };
    setResumeTime(t);
  }, [source, id, season, ep, epKey, audio, isAnime]);

  const handleTimeProgress = useCallback(
    (currentTime: number, duration: number) => {
      liveProgressRef.current = { time: currentTime, duration };
      playbackProgress.save({
        source,
        id,
        season,
        episode: ep,
        currentTime,
        duration,
        audio: isAnime ? audio : undefined,
      });
    },
    [source, id, season, ep, audio, isAnime],
  );

  useEffect(() => {
    const flush = () => {
      const { time, duration } = liveProgressRef.current;
      if (time > 0.5) {
        playbackProgress.save({
          source,
          id,
          season,
          episode: ep,
          currentTime: time,
          duration,
          audio: isAnime ? audio : undefined,
        });
      }
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [source, id, season, ep, audio, isAnime]);

  const detail = useQuery(detailQuery(source, id, lang));
  const title = detail.data?.title ?? "";
  const streamUrl = detail.data
    ? customStreamUrl(detail.data.key, detail.data.videoStreamUrl)
    : null;

  const aniStream = useQuery({
    queryKey: ["anime-stream", id, ep, audio, lang],
    queryFn: () =>
      getAniLastAnimeStream({
        data: {
          anilistId: id,
          malId: detail.data?.malId ?? null,
          episode: ep,
          audio,
          lang,
          title: detail.data?.title ?? null,
          englishTitle: detail.data?.englishTitle ?? null,
          romajiTitle: detail.data?.romajiTitle ?? null,
        },
      }),
    enabled: isAnime && !detail.isLoading && !streamUrl,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const inferredMediaType: "movie" | "tv" =
    detail.data?.mediaType ??
    (source === "tvmaze" || id.startsWith("series-") || id.startsWith("tv-") ? "tv" : "movie");
  const rawImdb = detail.data?.imdbId ?? id.match(/(tt\d{5,10})/)?.[1] ?? null;
  const rawTmdb =
    detail.data?.tmdbId ?? (source === "tmdb" ? id.replace(/^(movie|tv)-/, "") : null);

  const mediaStream = useQuery({
    queryKey: [
      "media-stream",
      source,
      id,
      inferredMediaType,
      season,
      ep,
      rawImdb,
      rawTmdb,
      detail.data?.title ?? null,
      detail.data?.year ?? null,
      lang,
    ],
    queryFn: () =>
      getMediaStream({
        data: {
          mediaType: inferredMediaType,
          imdbId: rawImdb,
          tmdbId: rawTmdb,
          title: detail.data?.title ?? null,
          year: detail.data?.year ?? null,
          season: inferredMediaType === "movie" ? 1 : season,
          episode: inferredMediaType === "movie" ? 1 : ep,
          lang,
        },
      }),
    enabled:
      !isAnime &&
      !detail.isLoading &&
      !streamUrl &&
      Boolean(rawImdb || rawTmdb || detail.data?.title),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const trailer = useQuery({
    queryKey: ["trailer", source, id],
    queryFn: async () => {
      const r = await getTrailer({ data: { source, id, title } }).catch(() => ({
        youtubeId: null as string | null,
      }));
      if (r.youtubeId || source !== "anilist") return r;
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
    const { time, duration } = liveProgressRef.current;
    if (time > 0.5) {
      playbackProgress.save({
        source,
        id,
        season,
        episode: ep,
        currentTime: time,
        duration,
        audio: isAnime ? audio : undefined,
      });
    }
    void navigate({
      to: "/title/$source/$id",
      params: { source, id },
      search: {
        ...(season > 1 ? { season } : {}),
        ...(isAnime ? { audio } : {}),
      },
      replace: true,
    });
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
    const { time, duration } = liveProgressRef.current;
    carryOverRef.current = { epKey, time };
    if (time > 0.5) {
      playbackProgress.save({
        source,
        id,
        season,
        episode: ep,
        currentTime: time,
        duration,
        audio: nextAudio,
      });
    }
    void navigate({
      to: "/watch/$source/$id",
      params: { source, id },
      search: { ep, audio: nextAudio },
      replace: true,
    });
  };

  if (streamUrl && isDirectVideo(streamUrl)) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
        <div className="relative min-h-0 flex-1">
          <Suspense fallback={<PlayerSpinner />}>
            <LazyVideoPlayer
              stream={{
                url: streamUrl,
                type: inferStreamType(streamUrl),
                provider: "SHADOW Stream",
                isDemo: false,
              }}
              title={title}
              poster={detail.data?.backdrop ?? detail.data?.poster ?? null}
              initialTime={resumeTime}
              onTimeProgress={handleTimeProgress}
              onBack={goBack}
            />
          </Suspense>
        </div>
        <WatchDiscordPrompt />
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
      ? `${t("detail.episode")} ${ep + 1}`
      : nextSequel
        ? `${nextSequel.title} · Ep 1`
        : null;
    const downloadItem = detail.data ?? {
      source: "anilist" as const,
      id,
      title: title || `Anime ${id}`,
    };

    const aniSources = aniStream.data?.sources ?? [];
    const clientAniEmbeds = buildAnimeEmbedFallbacks({
      anilistId: id,
      malId: detail.data?.malId ?? null,
      episode: ep,
      audio,
    });
    const aniEmbedFallbacks = aniStream.data?.embedFallbacks?.length
      ? aniStream.data.embedFallbacks
      : clientAniEmbeds;
    const safeAniEmbedIdx = aniEmbedFallbacks.length
      ? Math.min(embedIndex, aniEmbedFallbacks.length - 1)
      : 0;
    const aniEmbedUrl = aniEmbedFallbacks[safeAniEmbedIdx]?.url ?? aniStream.data?.embedUrl ?? null;
    const canUseAniNative = Boolean(aniStream.data?.ok && aniStream.data.streamUrl);
    const showAniNative = playerMode === "native" && canUseAniNative;

    const animeServerSwitcher = (canUseAniNative || aniEmbedFallbacks.length > 0) && (
      <div
        role="group"
        aria-label={t("player.streamServers")}
        className="inline-flex min-h-[44px] items-center rounded-lg border border-foreground/15 bg-scrim/75 p-0.5 backdrop-blur-md sm:min-h-9"
      >
        {canUseAniNative &&
          (aniSources.length > 0
            ? aniSources.slice(0, 2)
            : [
                {
                  url: aniStream.data!.streamUrl!,
                  type: aniStream.data!.type,
                  label: t("watch.server1"),
                },
              ]
          ).map((_, idx) => (
            <button
              key={`ani-srv-${idx}`}
              type="button"
              onClick={() => {
                setSelectedSourceIndex(idx);
                setPlayerMode("native");
              }}
              className={cn(
                "min-h-[38px] whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition sm:min-h-0",
                showAniNative && selectedSourceIndex === idx
                  ? "bg-brand-gradient text-primary-foreground shadow-sm"
                  : "text-foreground/75 hover:text-foreground",
              )}
            >
              {idx === 0 ? t("watch.server1") : t("watch.server2")}
            </button>
          ))}
        {aniEmbedFallbacks.length > 0 && (
          <button
            type="button"
            onClick={() => setPlayerMode("embed")}
            className={cn(
              "inline-flex min-h-[38px] items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition sm:min-h-0",
              !showAniNative && playerMode === "embed"
                ? "bg-brand-gradient text-primary-foreground shadow-sm"
                : !canUseAniNative && !aniStream.isPending
                  ? "bg-brand-gradient text-primary-foreground shadow-sm"
                  : "text-foreground/75 hover:text-foreground",
            )}
          >
            <MonitorPlay className="size-3.5" />
            <span>{t("watch.server3Embed")}</span>
          </button>
        )}
      </div>
    );

    const animeControls = (
      <>
        {animeServerSwitcher}
        <AudioToggle value={audio} onChange={switchAudio} />
        <div className="hidden items-center gap-1 sm:flex">
          <Button
            type="button"
            variant="glass"
            size="round"
            className="size-11 sm:size-9"
            disabled={!hasPrev}
            aria-label={t("watch.prevEpisode")}
            onClick={() => switchEpisode(ep - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="glass"
            size="round"
            className="size-11 sm:size-9"
            disabled={!hasNext}
            aria-label={t("watch.nextEpisode")}
            onClick={() => nextAction?.()}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button
          type="button"
          variant="glass"
          size="sm"
          className="min-h-[44px] rounded-full px-3 text-xs sm:h-9 sm:min-h-0"
          onClick={() => setEpisodesOpen((o) => !o)}
        >
          <ListVideo className="size-3.5" />
          <span>
            {lang === "fr" ? "Ép." : "Ep"} {ep}
          </span>
          {episodes.length > 0 && (
            <span className="text-muted-foreground">/ {episodes.length}</span>
          )}
        </Button>
        <button
          type="button"
          onClick={() => setIncludeSubtitles((s) => !s)}
          title={t("detail.subsToggleHint")}
          className={cn(
            "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold backdrop-blur-md transition sm:h-9 sm:min-h-0",
            includeSubtitles
              ? "border-cerulean/50 bg-cerulean/15 text-foreground"
              : "border-foreground/15 bg-scrim/75 text-foreground/85 hover:text-foreground",
          )}
        >
          {includeSubtitles ? (
            <>
              <Subtitles className="size-3.5 text-cerulean" />
              <span className="hidden sm:inline">{t("watch.plusSubs")}</span>
            </>
          ) : (
            <>
              <CaptionsOff className="size-3.5 text-gold" />
              <span className="hidden sm:inline">{t("watch.noSubs")}</span>
            </>
          )}
        </button>
        <DownloadButton
          item={downloadItem}
          episode={ep}
          audio={audio}
          includeSubtitles={includeSubtitles}
          className="min-h-[44px] rounded-full px-3 text-xs sm:h-9 sm:min-h-0 [&_svg]:size-3.5"
        />
      </>
    );

    const episodeDrawer = episodesOpen && (
      <aside
        aria-label={t("watch.episodeSelector")}
        className="fixed inset-y-0 right-0 z-[55] flex w-80 max-w-full flex-col border-l border-foreground/10 bg-popover/95 shadow-card backdrop-blur-xl"
      >
        <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
          <div>
            <p className="font-display text-sm font-semibold">{t("detail.episodes")}</p>
            <p className="text-xs text-muted-foreground">
              Audio: {audio.toUpperCase()} · {episodes.length || ep} {t("watch.available")}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="round"
            className="min-h-[44px] min-w-[44px] sm:size-8 sm:min-h-0 sm:min-w-0"
            aria-label={t("watch.closeEpisodes")}
            onClick={() => setEpisodesOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        {relations.length > 0 && (
          <div className="border-b border-foreground/10 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Layers className="size-3.5 text-cerulean" /> {t("watch.allSeasonsRelated")}
            </p>
            <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
              {relations.map((rel) => (
                <button
                  key={rel.id}
                  type="button"
                  onClick={() => switchAnimeSeason(rel.id)}
                  className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-foreground/10 bg-surface/60 px-2.5 py-1.5 text-left text-xs transition hover:border-cerulean/50 hover:bg-surface sm:min-h-0"
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
                    "flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 transition",
                    active ? "bg-cerulean/15 ring-1 ring-cerulean/40" : "hover:bg-surface",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => switchEpisode(item.number)}
                    className="flex min-h-[44px] flex-1 items-center gap-2 text-left font-display text-sm font-semibold tabular-nums sm:min-h-0"
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

    if (showAniNative && aniStream.data?.streamUrl) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
          <div className="relative min-h-0 flex-1">
            <Suspense fallback={<PlayerSpinner />}>
              <LazyVideoPlayer
                stream={{
                  url: aniStream.data.streamUrl,
                  type: aniStream.data.type,
                  provider: aniStream.data.provider,
                  isDemo: false,
                  subtitles: aniStream.data.subtitles,
                  ...(aniStream.data.sources?.length ? { sources: aniStream.data.sources } : {}),
                }}
                title={title || t("common.loading")}
                subtitle={`${t("detail.episode")} ${ep} · ${audio.toUpperCase()}${
                  currentEp?.title && currentEp.title !== `Episode ${ep}`
                    ? ` — ${currentEp.title}`
                    : ""
                }`}
                poster={detail.data?.backdrop ?? detail.data?.poster ?? null}
                initialTime={resumeTime}
                onTimeProgress={handleTimeProgress}
                onBack={goBack}
                onPrev={hasPrev ? () => switchEpisode(ep - 1) : null}
                onNext={nextAction}
                nextLabel={nextLabel}
                onSwitchEmbed={aniEmbedUrl ? () => setPlayerMode("embed") : undefined}
                selectedSourceIndex={selectedSourceIndex}
                onSelectSourceIndex={setSelectedSourceIndex}
                skipIntroSeconds={85}
                topRight={animeControls}
              />
            </Suspense>
          </div>
          <WatchDiscordPrompt />
          {episodeDrawer}
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/5 p-3 sm:gap-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button
              variant="glass"
              size="round"
              className="min-h-[44px] min-w-[44px] sm:size-10 sm:min-h-0 sm:min-w-0"
              aria-label={t("common.back")}
              onClick={goBack}
            >
              <ArrowLeft className="size-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-semibold sm:text-lg">
                {title || t("common.loading")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("detail.episode")} {ep} · {audio.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">{animeControls}</div>
        </div>
        {!detail.isLoading &&
          !(playerMode === "native" && aniStream.isPending) &&
          aniEmbedFallbacks.length > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 border-b border-foreground/5 bg-background/60 px-3 py-1.5">
              <span className="text-xs text-muted-foreground">{t("watch.embedNotice")}</span>
              {aniEmbedFallbacks.map((fb, idx) => (
                <button
                  key={fb.url}
                  type="button"
                  onClick={() => setEmbedIndex(idx)}
                  className={cn(
                    "min-h-[44px] whitespace-nowrap rounded-lg border px-3 py-1 text-xs font-semibold transition sm:min-h-8",
                    idx === safeAniEmbedIdx
                      ? "border-cerulean bg-brand-gradient text-primary-foreground"
                      : "border-foreground/15 bg-surface/80 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {fb.label}
                </button>
              ))}
            </div>
          )}
        <div className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4">
          {detail.isLoading || (playerMode === "native" && aniStream.isPending) ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="size-12 animate-spin text-cerulean" />
              <p className="text-sm text-muted-foreground">
                {t("watch.loadingAudioEp")
                  .replace("{audio}", audio.toUpperCase())
                  .replace("{ep}", String(ep))}
              </p>
            </div>
          ) : aniEmbedUrl ? (
            <div className="h-full w-full max-w-7xl overflow-hidden rounded-xl border border-foreground/10 bg-background">
              <iframe
                key={aniEmbedUrl}
                src={aniEmbedUrl}
                title={`${title || "Anime"} — ${t("detail.episode")} ${ep}`}
                className="size-full border-0"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="origin"
              />
            </div>
          ) : (
            <div className="flex max-w-md flex-col items-center gap-4 text-center">
              <p className="font-display text-xl font-semibold">
                {aniStream.data?.error || t("watch.streamUnavailable")}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  variant="brand"
                  className="min-h-[44px]"
                  onClick={() => void aniStream.refetch()}
                >
                  <RefreshCw className="size-4" /> {t("watch.retryStream")}
                </Button>
                <Button
                  variant="glass"
                  className="min-h-[44px]"
                  onClick={() => switchAudio(audio === "sub" ? "dub" : "sub")}
                >
                  {t("watch.switchTo")} {audio === "sub" ? "DUB" : "SUB"}
                </Button>
                {hasNext && nextAction && (
                  <Button variant="glass" className="min-h-[44px]" onClick={nextAction}>
                    {t("watch.nextEpisode")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
        <WatchDiscordPrompt />
        {episodeDrawer}
      </div>
    );
  }

  if (
    !isAnime &&
    !streamUrl &&
    (rawImdb ||
      rawTmdb ||
      detail.isLoading ||
      mediaStream.isPending ||
      mediaStream.data?.ok ||
      mediaStream.data?.embedUrl)
  ) {
    const isMovie = inferredMediaType === "movie";
    const allEpisodes = [...(detail.data?.episodes ?? [])].sort(
      (a, b) => (a.season ?? 1) - (b.season ?? 1) || a.number - b.number,
    );
    const seasons = (
      detail.data?.seasons?.length
        ? [...detail.data.seasons]
        : [...new Set(allEpisodes.map((e) => e.season ?? 1))]
    ).sort((a, b) => a - b);
    const seasonEpisodes = (
      seasons.length > 1 ? allEpisodes.filter((e) => (e.season ?? 1) === season) : allEpisodes
    ).sort((a, b) => a.number - b.number);
    const drawerEpisodes = (
      seasons.length > 1 ? allEpisodes.filter((e) => (e.season ?? 1) === drawerSeason) : allEpisodes
    ).sort((a, b) => a.number - b.number);
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
      source,
      id,
      title: title || "SHADOW Video",
      imdbId: rawImdb,
      tmdbId: rawTmdb,
      mediaType: inferredMediaType,
    };

    const mediaSources = mediaStream.data?.sources ?? [];
    const canUseNative = Boolean(mediaStream.data?.ok && mediaStream.data.streamUrl);
    const showNative = playerMode === "native" && canUseNative;
    const clientEmbedFallbacks = buildMediaEmbedFallbacks({
      mediaType: inferredMediaType,
      imdbId: rawImdb,
      tmdbId: rawTmdb,
      season: isMovie ? 1 : season,
      episode: isMovie ? 1 : ep,
    });
    const embedFallbacks = mediaStream.data?.embedFallbacks?.length
      ? mediaStream.data.embedFallbacks
      : clientEmbedFallbacks;
    const safeEmbedIdx = embedFallbacks.length
      ? Math.min(embedIndex, embedFallbacks.length - 1)
      : 0;
    const mediaEmbedUrl = embedFallbacks[safeEmbedIdx]?.url ?? mediaStream.data?.embedUrl ?? null;

    const mediaServerSwitcher = (canUseNative || embedFallbacks.length > 0) && (
      <div
        role="group"
        aria-label={t("player.streamServers")}
        className="inline-flex min-h-[44px] items-center rounded-lg border border-foreground/15 bg-scrim/75 p-0.5 backdrop-blur-md sm:min-h-9"
      >
        {canUseNative &&
          (mediaSources.length > 0
            ? mediaSources.slice(0, 2)
            : [
                {
                  url: mediaStream.data!.streamUrl!,
                  type: mediaStream.data!.type,
                  label: t("watch.server1"),
                },
              ]
          ).map((_, idx) => (
            <button
              key={`media-srv-${idx}`}
              type="button"
              onClick={() => {
                setSelectedSourceIndex(idx);
                setPlayerMode("native");
              }}
              className={cn(
                "min-h-[38px] whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition sm:min-h-0",
                showNative && selectedSourceIndex === idx
                  ? "bg-brand-gradient text-primary-foreground shadow-sm"
                  : "text-foreground/75 hover:text-foreground",
              )}
            >
              {idx === 0 ? t("watch.server1") : t("watch.server2")}
            </button>
          ))}
        {embedFallbacks.length > 0 && (
          <button
            type="button"
            onClick={() => setPlayerMode("embed")}
            className={cn(
              "inline-flex min-h-[38px] items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition sm:min-h-0",
              !showNative && (playerMode === "embed" || (!canUseNative && !mediaStream.isPending))
                ? "bg-brand-gradient text-primary-foreground shadow-sm"
                : "text-foreground/75 hover:text-foreground",
            )}
          >
            <MonitorPlay className="size-3.5" />
            <span>{t("watch.server3Embed")}</span>
          </button>
        )}
      </div>
    );

    const mediaControls = (
      <>
        {mediaServerSwitcher}
        <LanguageToggle compact />
        {!isMovie && (
          <>
            <div className="hidden items-center gap-1 sm:flex">
              <Button
                type="button"
                variant="glass"
                size="round"
                className="size-11 sm:size-9"
                disabled={!prevTarget}
                aria-label={t("watch.prevEpisode")}
                onClick={() => prevTarget && switchEpisode(prevTarget.ep, prevTarget.season)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="glass"
                size="round"
                className="size-11 sm:size-9"
                disabled={!nextTarget}
                aria-label={t("watch.nextEpisode")}
                onClick={() => nextTarget && switchEpisode(nextTarget.ep, nextTarget.season)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button
              type="button"
              variant="glass"
              size="sm"
              className="min-h-[44px] rounded-full px-3 text-xs sm:h-9 sm:min-h-0"
              onClick={() => setEpisodesOpen((o) => !o)}
            >
              <ListVideo className="size-3.5" />
              <span>
                {seasons.length > 1
                  ? `S${season} · ${lang === "fr" ? "Ép." : "Ep"} ${ep}`
                  : `${lang === "fr" ? "Ép." : "Ep"} ${ep}`}
              </span>
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
          className="min-h-[44px] rounded-full px-3 text-xs sm:h-9 sm:min-h-0 [&_svg]:size-3.5"
        />
      </>
    );

    const mediaDrawer = !isMovie && episodesOpen && (
      <aside
        aria-label={t("watch.episodeSelector")}
        className="fixed inset-y-0 right-0 z-[55] flex w-80 max-w-full flex-col border-l border-foreground/10 bg-popover/95 shadow-card backdrop-blur-xl"
      >
        <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
          <div>
            <p className="font-display text-sm font-semibold">{t("detail.episodes")}</p>
            <p className="text-xs text-muted-foreground">
              {seasons.length > 1
                ? `${t("detail.season")} ${drawerSeason} · ${drawerEpisodes.length} ${t("watch.episodesLower")}`
                : `${drawerEpisodes.length || ep} ${t("watch.available")}`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="round"
            className="min-h-[44px] min-w-[44px] sm:size-8 sm:min-h-0 sm:min-w-0"
            aria-label={t("watch.closeEpisodes")}
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
                  "min-h-[44px] rounded-full border px-3 py-1 text-xs font-semibold transition sm:min-h-0",
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
              const cleaned = item.title?.replace(/^S\d+·E\d+\s*[—–-]\s*/i, "").trim();
              const subLabel =
                cleaned && !new RegExp(`^Episode\\s*${item.number}$`, "i").test(cleaned)
                  ? cleaned
                  : null;
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 transition",
                    active ? "bg-cerulean/15 ring-1 ring-cerulean/40" : "hover:bg-surface",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => switchEpisode(item.number, itemSeason)}
                    className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left font-display text-sm font-semibold tabular-nums sm:min-h-0"
                  >
                    {active && <Play className="size-3.5 shrink-0 fill-current text-cerulean" />}
                    <span>{item.number}</span>
                    {subLabel && (
                      <span className="truncate font-sans text-xs font-normal text-muted-foreground">
                        {subLabel}
                      </span>
                    )}
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
        <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
          <div className="relative min-h-0 flex-1">
            <Suspense fallback={<PlayerSpinner />}>
              <LazyVideoPlayer
                stream={{
                  url: mediaStream.data.streamUrl,
                  type: mediaStream.data.type,
                  provider: mediaStream.data.provider,
                  isDemo: false,
                  subtitles: mediaStream.data.subtitles,
                  ...(mediaStream.data.sources?.length
                    ? { sources: mediaStream.data.sources }
                    : {}),
                }}
                title={title || t("common.loading")}
                subtitle={
                  isMovie
                    ? `${t("watch.fullMovie")}${lang === "fr" ? " · FR" : ""}`
                    : `${seasons.length > 1 ? `${t("detail.season")} ${season} · ` : ""}${t("detail.episode")} ${ep}${
                        currentEp?.title && currentEp.title !== `Episode ${ep}`
                          ? ` — ${currentEp.title}`
                          : ""
                      }`
                }
                poster={detail.data?.backdrop ?? detail.data?.poster ?? null}
                initialTime={resumeTime}
                onTimeProgress={handleTimeProgress}
                onBack={goBack}
                onPrev={prevTarget ? () => switchEpisode(prevTarget.ep, prevTarget.season) : null}
                onNext={nextTarget ? () => switchEpisode(nextTarget.ep, nextTarget.season) : null}
                nextLabel={
                  nextTarget
                    ? seasons.length > 1
                      ? `${t("detail.season")} ${nextTarget.season} · Ep ${nextTarget.ep}`
                      : `${t("detail.episode")} ${nextTarget.ep}`
                    : null
                }
                onSwitchEmbed={mediaEmbedUrl ? () => setPlayerMode("embed") : undefined}
                selectedSourceIndex={selectedSourceIndex}
                onSelectSourceIndex={setSelectedSourceIndex}
                skipIntroSeconds={isMovie ? 90 : 60}
                topRight={mediaControls}
              />
            </Suspense>
          </div>
          <WatchDiscordPrompt />
          {mediaDrawer}
        </div>
      );
    }

    if (detail.isLoading || mediaStream.isPending || mediaEmbedUrl) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/5 p-3 sm:gap-3 sm:p-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Button
                variant="glass"
                size="round"
                className="min-h-[44px] min-w-[44px] sm:size-10 sm:min-h-0 sm:min-w-0"
                aria-label={t("common.back")}
                onClick={goBack}
              >
                <ArrowLeft className="size-5" />
              </Button>
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold sm:text-lg">
                  {title || t("common.loading")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isMovie
                    ? t("watch.fullMovie")
                    : `${seasons.length > 1 ? `${t("detail.season")} ${season} · ` : ""}${t("detail.episode")} ${ep}`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">{mediaControls}</div>
          </div>
          {!detail.isLoading &&
            !(!mediaEmbedUrl && mediaStream.isPending) &&
            !(playerMode === "native" && mediaStream.isPending) &&
            embedFallbacks.length > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 border-b border-foreground/5 bg-background/60 px-3 py-1.5">
                <span className="text-xs text-muted-foreground">{t("watch.embedNotice")}</span>
                {embedFallbacks.map((fb, idx) => (
                  <button
                    key={fb.url}
                    type="button"
                    onClick={() => setEmbedIndex(idx)}
                    className={cn(
                      "min-h-[44px] whitespace-nowrap rounded-lg border px-3 py-1 text-xs font-semibold transition sm:min-h-8",
                      idx === safeEmbedIdx
                        ? "border-cerulean bg-brand-gradient text-primary-foreground"
                        : "border-foreground/15 bg-surface/80 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {fb.label}
                  </button>
                ))}
              </div>
            )}
          <div className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4">
            {detail.isLoading ||
            (!mediaEmbedUrl && mediaStream.isPending) ||
            (playerMode === "native" && mediaStream.isPending) ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <Loader2 className="size-12 animate-spin text-cerulean" />
                <p className="text-sm text-muted-foreground">
                  {isMovie
                    ? t("watch.loadingMovie")
                    : t("watch.loadingSeasonEp")
                        .replace("{season}", String(season))
                        .replace("{ep}", String(ep))}
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
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="origin"
                />
              </div>
            ) : null}
          </div>
          <WatchDiscordPrompt />
          {mediaDrawer}
        </div>
      );
    }
  }

  const ytId = trailer.data?.youtubeId;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <Button
          variant="glass"
          size="round"
          className="min-h-[44px] min-w-[44px] sm:size-10 sm:min-h-0 sm:min-w-0"
          aria-label={t("common.back")}
          onClick={goBack}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold sm:text-lg">
            {title || t("common.loading")}
          </p>
          <p className="text-xs text-muted-foreground">
            {streamUrl ? t("watch.nowPlaying") : t("watch.officialTrailer")}
          </p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
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
            <Suspense fallback={<PlayerSpinner />}>
              <LazyTrailerFrame
                key={ytId}
                youtubeId={ytId}
                title={title}
                registerStop={registerStop}
              />
            </Suspense>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="font-display text-xl font-semibold">{t("watch.noTrailer")}</p>
            <Button variant="glass" size="xl" onClick={goBack}>
              {t("common.goBack")}
            </Button>
          </div>
        )}
      </div>
      <WatchDiscordPrompt />
    </div>
  );
}
