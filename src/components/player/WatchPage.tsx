import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CaptionsOff,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  HardDrive,
  Layers,
  ListVideo,
  Loader2,
  Maximize,
  Minimize,
  MonitorPlay,
  Play,
  RefreshCw,
  Square,
  Subtitles,
  Users,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DownloadButton } from "@/components/media/DownloadButton";
import { LanguageToggle } from "@/components/media/LanguageToggle";
import { Button } from "@/components/ui/button";
import { detailQuery } from "@/lib/catalog";
import { isAnimeItem, resolveAniListIdForItem } from "@/lib/catalog/anime-bridge";
import type { Source } from "@/lib/catalog/types";
import { offlineLibrary, type OfflineMediaEntry } from "@/lib/download/offline-db";
import { downloads } from "@/lib/download/store";
import { useT } from "@/lib/i18n";
import { useLandscapeFullscreen } from "@/lib/player/fullscreen";
import { playbackProgress } from "@/lib/player/progress";
import { useLiveWatchers } from "@/lib/presence/use-live-watchers";
import { buildAnimeEmbedFallbacks, getAniLastAnimeStream } from "@/lib/stream/anilast.functions";
import { customStreamUrl, isDirectVideo } from "@/lib/stream/custom-streams";
import { buildMediaEmbedFallbacks, getMediaStream } from "@/lib/stream/media.functions";
import { inferStreamType, type AudioOption } from "@/lib/stream/resolver";
import { resolvePreferredAnimeAudio, useUserSettings } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

const LazyVideoPlayer = lazy(() => import("@/components/player/VideoPlayer"));

export const EMBED_FAILOVER_TIMEOUT_MS = 16_000;

const DISCORD_URL = "https://discord.gg/uKtF6Efs2";

function LiveWatchingBadge({ count }: { count: number | null }) {
  const { t } = useT();
  if (!count || count <= 0) return null;
  const template = count === 1 ? t("watch.watchingNow") : t("watch.watchingNowPlural");
  const label = template.replace("{count}", String(count));
  return (
    <span
      data-testid="live-watching-count"
      aria-live="polite"
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-emerald-400/30 bg-scrim/80 px-3 py-1 text-xs font-semibold tabular-nums text-foreground backdrop-blur-md"
    >
      <span className="size-2 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
      <Users className="size-3.5 text-emerald-400" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function EmbedPlayerFrame({
  src,
  title,
  onLoad,
  onError,
  referrerPolicy = "origin",
  className,
}: {
  src: string;
  title: string;
  onLoad?: () => void;
  onError?: () => void;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  className?: string;
}) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const { fullscreen, toggleFullscreen } = useLandscapeFullscreen(containerRef);

  return (
    <div
      ref={containerRef}
      data-testid="embed-player-container"
      className={cn(
        "group/embed relative overflow-hidden rounded-xl border border-foreground/10 bg-background",
        fullscreen ? "fixed inset-0 z-[70] h-full w-full max-w-none rounded-none" : className,
      )}
    >
      <iframe
        key={src}
        src={src}
        title={title}
        className="size-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy={referrerPolicy}
        onLoad={onLoad}
        onError={onError}
      />
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        aria-label={fullscreen ? t("player.exitFullScreen") : t("watch.expandLandscape")}
        title={fullscreen ? t("player.exitFullScreen") : t("watch.expandLandscape")}
        className="absolute bottom-3 right-3 z-20 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-foreground/20 bg-scrim/90 px-3.5 py-2 text-xs font-semibold text-foreground shadow-card backdrop-blur-md transition hover:border-cerulean hover:bg-scrim sm:opacity-90 sm:group-hover/embed:opacity-100"
      >
        {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        <span className="sm:hidden">
          {fullscreen ? t("player.exitFullScreen") : t("watch.expandLandscape")}
        </span>
      </button>
    </div>
  );
}

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
  const { lang, t } = useT();
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
          title={
            lang === "fr"
              ? opt === "sub"
                ? "Audio japonais avec sous-titres français (VOSTFR)"
                : "Version française (VF)"
              : opt === "sub"
                ? "Japanese audio with English subtitles"
                : "English dubbed audio"
          }
          className={cn(
            "min-h-[38px] rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition sm:min-h-0",
            value === opt
              ? "bg-brand-gradient text-primary-foreground shadow-sm"
              : "text-foreground/75 hover:text-foreground",
          )}
        >
          {opt === "sub"
            ? lang === "fr"
              ? "SUB · VOSTFR"
              : "SUB · JP"
            : lang === "fr"
              ? "DUB · VF"
              : "DUB · EN"}
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
  offlineId?: string | undefined;
}

export function WatchPage({
  source,
  id,
  ep: searchEp,
  season: searchSeason,
  audio: searchAudio,
  offlineId,
}: WatchPageProps) {
  const { lang, t } = useT();
  const settings = useUserSettings();
  const liveWatchers = useLiveWatchers(`${source}:${id}`);

  const lastWatched =
    typeof window !== "undefined" ? playbackProgress.getLastWatched(source, id) : null;
  const ep = searchEp ?? lastWatched?.episode ?? 1;
  const season = searchSeason ?? lastWatched?.season ?? 1;
  const audio: AudioOption = resolvePreferredAnimeAudio({
    explicitAudio: searchAudio,
    lastWatched,
    settings,
  });

  const navigate = useNavigate();

  const detail = useQuery(detailQuery(source, id, lang));
  const isAnime = source === "anilist" || isAnimeItem(detail.data);
  const bridgedAnilist = useQuery({
    queryKey: ["anime-bridge", source, id, detail.data?.imdbId ?? null, detail.data?.title ?? null],
    queryFn: () =>
      resolveAniListIdForItem({
        source,
        id,
        title: detail.data?.title,
        englishTitle: detail.data?.englishTitle,
        imdbId: detail.data?.imdbId,
      }),
    enabled:
      !offlineId &&
      isAnime &&
      source !== "anilist" &&
      Boolean(detail.data?.imdbId || detail.data?.title),
    staleTime: 1000 * 60 * 60,
  });
  const canonicalAnilistId = source === "anilist" ? id : (bridgedAnilist.data ?? null);
  const useAnimePipeline =
    source === "anilist" || (isAnime && (bridgedAnilist.isPending || Boolean(canonicalAnilistId)));

  const [offlineState, setOfflineState] = useState<{
    loading: boolean;
    entry: OfflineMediaEntry | null;
    videoUrl: string | null;
    subtitleUrl: string | null;
    notFound: boolean;
  }>({
    loading: Boolean(offlineId),
    entry: null,
    videoUrl: null,
    subtitleUrl: null,
    notFound: false,
  });

  useEffect(() => {
    if (!offlineId) {
      setOfflineState({
        loading: false,
        entry: null,
        videoUrl: null,
        subtitleUrl: null,
        notFound: false,
      });
      return;
    }
    let cancelled = false;
    let vUrl: string | null = null;
    let sUrl: string | null = null;
    setOfflineState({
      loading: true,
      entry: null,
      videoUrl: null,
      subtitleUrl: null,
      notFound: false,
    });
    void offlineLibrary.get(offlineId).then((entry) => {
      if (cancelled) return;
      if (!entry) {
        setOfflineState({
          loading: false,
          entry: null,
          videoUrl: null,
          subtitleUrl: null,
          notFound: true,
        });
        return;
      }
      vUrl = URL.createObjectURL(entry.videoBlob);
      if (entry.subtitleVtt) {
        sUrl = URL.createObjectURL(
          new Blob([entry.subtitleVtt], { type: "text/vtt; charset=utf-8" }),
        );
      }
      setOfflineState({
        loading: false,
        entry,
        videoUrl: vUrl,
        subtitleUrl: sUrl,
        notFound: false,
      });
    });
    return () => {
      cancelled = true;
      if (vUrl) URL.revokeObjectURL(vUrl);
      if (sUrl) URL.revokeObjectURL(sUrl);
    };
  }, [offlineId]);

  const [playerMode, setPlayerMode] = useState<"native" | "embed">("native");
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);
  const [embedIndex, setEmbedIndex] = useState(0);
  const [failedEmbedUrls, setFailedEmbedUrls] = useState<string[]>([]);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [autoSwitchNote, setAutoSwitchNote] = useState<string | null>(null);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [includeSubtitles, setIncludeSubtitles] = useState(() => settings.downloadIncludeSubtitles);
  const [drawerSeason, setDrawerSeason] = useState(season);
  const [drawerBatchMode, setDrawerBatchMode] = useState(false);
  const [drawerSelectedEps, setDrawerSelectedEps] = useState<number[]>([]);

  const liveProgressRef = useRef<{ time: number; duration: number }>({ time: 0, duration: 0 });
  const carryOverRef = useRef<{ epKey: string; time: number } | null>(null);
  const autoSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeEmbedTargetRef = useRef<{
    url: string | null;
    pool: { label: string; url: string; available?: boolean }[];
  }>({ url: null, pool: [] });
  const epKey = `${source}:${id}:s${season}:e${ep}`;

  const [resumeTime, setResumeTime] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return playbackProgress.get(source, id, season, ep)?.currentTime ?? 0;
  });

  useEffect(() => {
    setDrawerSeason(season);
  }, [season]);

  useEffect(() => {
    setPlayerMode("native");
    setSelectedSourceIndex(0);
    setEmbedIndex(0);
    setFailedEmbedUrls([]);
    setIframeLoaded(false);
    setAutoSwitchNote(null);
    if (carryOverRef.current && carryOverRef.current.epKey === epKey) {
      setResumeTime(carryOverRef.current.time);
      carryOverRef.current = null;
      return;
    }
    const saved = playbackProgress.get(source, id, season, ep);
    const t = saved?.currentTime ?? 0;
    liveProgressRef.current = { time: t, duration: saved?.duration ?? 0 };
    setResumeTime(t);
  }, [source, id, season, ep, epKey, audio, isAnime, lang]);

  useEffect(() => {
    setDrawerBatchMode(false);
    setDrawerSelectedEps([]);
  }, [source, id]);

  const detailItemRef = useRef(detail.data);
  detailItemRef.current = detail.data;

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
        item: detailItemRef.current,
      });
    },
    [source, id, season, ep, audio, isAnime],
  );

  // Record show/episode in Continue Watching as soon as metadata resolves (covers iframe embeds too!)
  useEffect(() => {
    if (!detail.data) return;
    const saved = playbackProgress.get(source, id, season, ep);
    playbackProgress.save({
      source,
      id,
      season,
      episode: ep,
      currentTime: saved?.currentTime ?? liveProgressRef.current.time,
      duration: saved?.duration ?? liveProgressRef.current.duration,
      audio: isAnime ? audio : undefined,
      item: detail.data,
    });
  }, [source, id, season, ep, audio, isAnime, detail.data]);

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
          item: detailItemRef.current,
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

  const title = detail.data?.title ?? "";
  const streamUrl = detail.data
    ? customStreamUrl(detail.data.key, detail.data.videoStreamUrl)
    : null;

  const animeEpNumber = useMemo(() => {
    if (source === "anilist" || season <= 1) return ep;
    const allEps = detail.data?.episodes ?? [];
    const earlierCount = allEps.filter((e) => (e.season ?? 1) < season).length;
    return earlierCount > 0 ? earlierCount + ep : ep;
  }, [source, season, ep, detail.data?.episodes]);

  const aniStream = useQuery({
    queryKey: [
      "anime-stream",
      canonicalAnilistId,
      detail.data?.malId ?? null,
      animeEpNumber,
      audio,
      lang,
      detail.data?.mediaType ?? null,
    ],
    queryFn: () =>
      getAniLastAnimeStream({
        data: {
          anilistId: canonicalAnilistId!,
          malId: detail.data?.malId ?? null,
          episode: animeEpNumber,
          audio,
          lang,
          isMovie: detail.data?.mediaType === "movie",
          title: detail.data?.title ?? null,
          englishTitle: detail.data?.englishTitle ?? null,
          romajiTitle: detail.data?.romajiTitle ?? null,
        },
      }),
    enabled:
      !offlineId &&
      useAnimePipeline &&
      Boolean(canonicalAnilistId) &&
      !detail.isLoading &&
      !streamUrl,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const advanceEmbedServer = useCallback(
    (badUrl: string, pool: { label: string; url: string }[]) => {
      setFailedEmbedUrls((prev) => {
        const nextFailed = prev.includes(badUrl) ? prev : [...prev, badUrl];
        const remaining = pool.filter((item) => !nextFailed.includes(item.url));
        if (remaining[0]) {
          const msg = t("watch.switchingServer").replace("{server}", remaining[0].label);
          setAutoSwitchNote(msg);
          if (autoSwitchTimerRef.current) clearTimeout(autoSwitchTimerRef.current);
          autoSwitchTimerRef.current = setTimeout(() => setAutoSwitchNote(null), 3500);
        }
        return nextFailed;
      });
      setEmbedIndex(0);
      setIframeLoaded(false);
    },
    [t],
  );

  const switchToEmbedMode = useCallback(() => {
    setEmbedIndex(0);
    setIframeLoaded(false);
    setPlayerMode("embed");
  }, []);

  // Anime French audio/subtitle routing:
  // - fr + sub: Japanese audio + French subtitles, switching to VOSTFR embed if native lacks French subtitles.
  // - fr + dub: play extracted VF direct stream natively when available, else genuine VF embed, else English dub + FR subtitles.
  useEffect(() => {
    if (!useAnimePipeline || !aniStream.data) return;
    if (lang === "fr") {
      if (audio === "dub") {
        if (aniStream.data.ok && aniStream.data.streamUrl) {
          setPlayerMode("native");
        } else {
          setPlayerMode("embed");
        }
        return;
      }
      if (
        audio === "sub" &&
        !aniStream.data.hasFrenchSubtitles &&
        (aniStream.data.embedFallbacks?.length ?? 0) > 0 &&
        !(
          aniStream.data.ok &&
          aniStream.data.streamUrl &&
          aniStream.data.sources?.some((s) => s.label.includes("VOSTFR"))
        )
      ) {
        setPlayerMode("embed");
      } else if (aniStream.data.ok && aniStream.data.streamUrl) {
        setPlayerMode("native");
      } else {
        setPlayerMode("embed");
      }
      return;
    }
    if (aniStream.data.ok && aniStream.data.streamUrl) {
      setPlayerMode("native");
    } else {
      setPlayerMode("embed");
    }
  }, [useAnimePipeline, lang, audio, aniStream.data]);

  const inferredMediaType: "movie" | "tv" =
    detail.data?.mediaType ??
    (source === "tvmaze" || id.startsWith("series-") || id.startsWith("tv-") ? "tv" : "movie");
  const rawImdb = detail.data?.imdbId ?? id.match(/(tt\d{5,10})/)?.[1] ?? null;
  const rawTmdb =
    detail.data?.tmdbId ?? (source === "tmdb" ? id.replace(/^(movie|tv)-/, "") : null);

  const rawTvmaze = source === "tvmaze" && /^\d{1,10}$/.test(id) ? id : null;

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
      rawTvmaze,
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
          tvmazeId: rawTvmaze,
          title: detail.data?.title ?? null,
          year: detail.data?.year ?? null,
          season: inferredMediaType === "movie" ? 1 : season,
          episode: inferredMediaType === "movie" ? 1 : ep,
          lang,
        },
      }),
    enabled:
      !offlineId &&
      !useAnimePipeline &&
      !detail.isLoading &&
      !streamUrl &&
      Boolean(rawImdb || rawTmdb || rawTvmaze || detail.data?.title),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  // Non-anime routing: switch to French server when lang=fr & native lacks FR audio,
  // use native player when playable, otherwise fall back cleanly to embed mode so watchdog failover runs.
  useEffect(() => {
    if (useAnimePipeline || !mediaStream.data) return;
    if (
      lang === "fr" &&
      !mediaStream.data.hasFrenchAudio &&
      (mediaStream.data.embedFallbacks?.some((fb) => fb.label.includes("VF")) ?? false)
    ) {
      setPlayerMode("embed");
    } else if (mediaStream.data.ok && mediaStream.data.streamUrl) {
      setPlayerMode("native");
    } else {
      setPlayerMode("embed");
    }
  }, [useAnimePipeline, lang, mediaStream.data]);

  // Watchdog: give each embed server at least 16s to load before auto-advancing to backup.
  useEffect(() => {
    if (playerMode !== "embed" || iframeLoaded) return;
    const { url, pool } = activeEmbedTargetRef.current;
    if (!url || pool.length <= 1) return;
    const timer = setTimeout(() => {
      advanceEmbedServer(url, pool);
    }, EMBED_FAILOVER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [
    playerMode,
    iframeLoaded,
    embedIndex,
    failedEmbedUrls.length,
    aniStream.data,
    mediaStream.data,
    advanceEmbedServer,
  ]);

  // Also listen for explicit player/sandbox error events posted from the active embed iframe origin.
  useEffect(() => {
    if (playerMode !== "embed") return;
    const onMessage = (event: MessageEvent) => {
      const { url, pool } = activeEmbedTargetRef.current;
      if (!url || pool.length <= 1) return;
      try {
        if (event.origin !== new URL(url).origin) return;
      } catch {
        return;
      }
      const raw = typeof event.data === "string" ? event.data : JSON.stringify(event.data ?? "");
      if (
        /"(?:event|type)"\s*:\s*"(?:error|PLAYER_ERROR|sandbox)"|"fatal"\s*:\s*true|disable\s*sandbox|sandbox\s*not\s*allowed/i.test(
          raw,
        )
      ) {
        advanceEmbedServer(url, pool);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [playerMode, advanceEmbedServer]);

  const goBack = () => {
    const { time, duration } = liveProgressRef.current;
    if (time > 0.5 || detailItemRef.current) {
      playbackProgress.save({
        source,
        id,
        season,
        episode: ep,
        currentTime: time,
        duration,
        audio: isAnime ? audio : undefined,
        item: detailItemRef.current,
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
      search: isAnime
        ? source !== "anilist" && nextSeason > 1
          ? { season: nextSeason, ep: nextEp, audio }
          : { ep: nextEp, audio }
        : { season: nextSeason, ep: nextEp },
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
    if (time > 0.5 || detailItemRef.current) {
      playbackProgress.save({
        source,
        id,
        season,
        episode: ep,
        currentTime: time,
        duration,
        audio: nextAudio,
        item: detailItemRef.current,
      });
    }
    void navigate({
      to: "/watch/$source/$id",
      params: { source, id },
      search: {
        ...(source !== "anilist" && season > 1 ? { season } : {}),
        ep,
        audio: nextAudio,
      },
      replace: true,
    });
  };

  if (offlineId) {
    if (offlineState.loading) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
          <div className="flex-1">
            <PlayerSpinner />
          </div>
          <WatchDiscordPrompt />
        </div>
      );
    }
    if (offlineState.notFound || !offlineState.entry || !offlineState.videoUrl) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-scrim px-6 text-center">
          <HardDrive className="size-10 text-muted-foreground" />
          <p className="font-display text-xl font-semibold">{t("watch.offlineUnavailable")}</p>
          <Button variant="glass" size="xl" onClick={goBack}>
            {t("common.goBack")}
          </Button>
        </div>
      );
    }
    const offEntry = offlineState.entry;
    const isOffMovie = offEntry.mediaType === "movie";
    const offSubLabel = isOffMovie
      ? t("watch.fullMovie")
      : `${offEntry.season > 1 ? `S${offEntry.season} · ` : ""}${t("detail.episode")} ${offEntry.episode}`;
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
        <div className="relative min-h-0 flex-1">
          <Suspense fallback={<PlayerSpinner />}>
            <LazyVideoPlayer
              stream={{
                url: offlineState.videoUrl,
                type: "mp4",
                provider: "SHADOW Offline",
                isDemo: false,
                ...(offlineState.subtitleUrl
                  ? {
                      subtitles: [
                        {
                          url: offlineState.subtitleUrl,
                          lang: offEntry.lang,
                          label: offEntry.lang === "fr" ? "Français" : "English",
                        },
                      ],
                    }
                  : {}),
              }}
              title={offEntry.title || title}
              subtitle={`${offSubLabel} · ${t("watch.offlineBadge")}`}
              poster={offEntry.poster ?? detail.data?.backdrop ?? detail.data?.poster ?? null}
              initialTime={resumeTime}
              preferSubtitles={Boolean(offlineState.subtitleUrl)}
              preferredAudioLang={
                offEntry.audio === "dub" ? (offEntry.lang === "fr" ? "fr" : "en") : "ja"
              }
              onTimeProgress={handleTimeProgress}
              onBack={goBack}
              topRight={
                <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-emerald-400/30 bg-scrim/80 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur-md">
                  <HardDrive className="size-3.5 text-emerald-400" />
                  <span>{t("watch.offlineBadge")}</span>
                </span>
              }
            />
          </Suspense>
        </div>
        <WatchDiscordPrompt />
      </div>
    );
  }

  if (streamUrl && isDirectVideo(streamUrl)) {
    const directDownloadItem = detail.data ?? {
      source,
      id,
      title: title || "SHADOW Video",
      mediaType: inferredMediaType,
      imdbId: rawImdb,
      tmdbId: rawTmdb,
    };
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
              preferredAudioLang={lang}
              onTimeProgress={handleTimeProgress}
              onBack={goBack}
              topRight={
                <>
                  <LiveWatchingBadge count={liveWatchers} />
                  <DownloadButton
                    item={directDownloadItem}
                    season={inferredMediaType === "movie" ? 1 : season}
                    episode={inferredMediaType === "movie" ? 1 : ep}
                    className="min-h-[44px] rounded-full px-3 text-xs sm:h-9 sm:min-h-0 [&_svg]:size-3.5"
                  />
                </>
              }
            />
          </Suspense>
        </div>
        <WatchDiscordPrompt />
      </div>
    );
  }

  if (useAnimePipeline && !streamUrl) {
    const allEpisodes = [...(detail.data?.episodes ?? [])].sort(
      (a, b) => (a.season ?? 1) - (b.season ?? 1) || a.number - b.number,
    );
    const episodes =
      source !== "anilist" && allEpisodes.some((e) => (e.season ?? 1) === season)
        ? allEpisodes.filter((e) => (e.season ?? 1) === season)
        : allEpisodes;
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
      ? () => switchEpisode(ep + 1, season)
      : nextSequel
        ? () => switchAnimeSeason(nextSequel.id)
        : null;
    const nextLabel = hasNextInSeason
      ? `${t("detail.episode")} ${ep + 1}`
      : nextSequel
        ? `${nextSequel.title} · Ep 1`
        : null;
    const downloadItem = detail.data ?? {
      source,
      id,
      section: "anime" as const,
      title: title || `Anime ${id}`,
    };

    const isFrenchDub = lang === "fr" && audio === "dub";
    const isFrenchSub = lang === "fr" && audio === "sub";
    const waitingForAnimeResolve =
      (source !== "anilist" && bridgedAnilist.isPending) ||
      ((playerMode === "native" || isFrenchDub || isFrenchSub) && aniStream.isPending);

    const aniSources = aniStream.data?.sources ?? [];
    const clientAniEmbeds = canonicalAnilistId
      ? buildAnimeEmbedFallbacks({
          anilistId: canonicalAnilistId,
          malId: detail.data?.malId ?? null,
          episode: animeEpNumber,
          audio,
        })
      : [];
    const rawAniEmbedFallbacks = aniStream.data
      ? (aniStream.data.embedFallbacks ?? [])
      : isFrenchDub
        ? []
        : clientAniEmbeds;
    const aniEmbedFallbacks = rawAniEmbedFallbacks.filter(
      (fb) => !failedEmbedUrls.includes(fb.url),
    );
    const safeAniEmbedIdx = aniEmbedFallbacks.length
      ? Math.min(embedIndex, aniEmbedFallbacks.length - 1)
      : 0;
    const aniEmbedUrl = aniEmbedFallbacks[safeAniEmbedIdx]?.url ?? null;
    const canUseAniNative = Boolean(aniStream.data?.ok && aniStream.data.streamUrl);
    const showAniNative = playerMode === "native" && canUseAniNative;
    const aniAudioBadge =
      lang === "fr"
        ? audio === "dub"
          ? aniStream.data?.dubFallbackToEnglish
            ? t("watch.dubEnFrSubs")
            : "VF"
          : "VOSTFR"
        : audio.toUpperCase();
    activeEmbedTargetRef.current = {
      url: showAniNative ? null : aniEmbedUrl,
      pool: aniEmbedFallbacks,
    };

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
        <LiveWatchingBadge count={liveWatchers} />
        {animeServerSwitcher}
        <LanguageToggle compact />
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
          season={source === "anilist" ? 1 : season}
          episode={ep}
          audio={audio}
          includeSubtitles={includeSubtitles}
          anilistId={canonicalAnilistId}
          className="min-h-[44px] rounded-full px-3 text-xs sm:h-9 sm:min-h-0 [&_svg]:size-3.5"
        />
      </>
    );

    const drawerEpisodesList = episodes.length
      ? episodes
      : Array.from({ length: Math.max(ep + 5, 12) }, (_, i) => ({
          id: `${id}-${i + 1}`,
          number: i + 1,
        }));

    const toggleDrawerEp = (num: number) => {
      setDrawerSelectedEps((prev) =>
        prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num],
      );
    };

    const startDrawerBatchDownload = () => {
      const sorted = [...drawerSelectedEps].sort((a, b) => a - b);
      if (!sorted.length) return;
      void downloads.startBatch(
        sorted.map((epNum) => ({
          source,
          id,
          episode: epNum,
          season: source === "anilist" ? 1 : season,
          mediaType: detail.data?.mediaType,
          title: downloadItem.title,
          poster: detail.data?.poster ?? null,
          audio,
          includeSubtitles,
          lang,
          isAnime: true,
          anilistId: canonicalAnilistId,
          malId: detail.data?.malId,
          imdbId: detail.data?.imdbId,
          tmdbId: detail.data?.tmdbId,
          englishTitle: detail.data?.englishTitle,
          romajiTitle: detail.data?.romajiTitle,
        })),
      );
      setDrawerBatchMode(false);
      setDrawerSelectedEps([]);
    };

    const episodeDrawer = episodesOpen && (
      <aside
        aria-label={t("watch.episodeSelector")}
        className="fixed inset-y-0 right-0 z-[55] flex w-80 max-w-full flex-col border-l border-foreground/10 bg-popover/95 shadow-card backdrop-blur-xl"
      >
        <div className="flex items-center justify-between border-b border-foreground/10 px-4 py-3">
          <div>
            <p className="font-display text-sm font-semibold">{t("detail.episodes")}</p>
            <p className="text-xs text-muted-foreground">
              Audio: {lang === "fr" ? (audio === "dub" ? "VF" : "VOSTFR") : audio.toUpperCase()} ·{" "}
              {episodes.length || ep} {t("watch.available")}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={drawerBatchMode ? "brand" : "glass"}
              size="sm"
              className="min-h-[44px] rounded-full px-3 text-xs sm:h-8 sm:min-h-0"
              onClick={() => {
                setDrawerBatchMode((prev) => {
                  if (prev) setDrawerSelectedEps([]);
                  return !prev;
                });
              }}
            >
              {drawerBatchMode ? t("detail.cancelSelect") : t("detail.selectEpisodes")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="round"
              className="min-h-[44px] min-w-[44px] sm:size-8 sm:min-h-0 sm:min-w-0"
              aria-label={t("watch.closeEpisodes")}
              onClick={() => {
                setEpisodesOpen(false);
                setDrawerBatchMode(false);
                setDrawerSelectedEps([]);
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        {drawerBatchMode && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 bg-surface/60 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDrawerSelectedEps(drawerEpisodesList.map((item) => item.number))}
                className="min-h-[36px] rounded-md border border-foreground/15 bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-cerulean/50 sm:min-h-0"
              >
                {t("detail.selectAll")}
              </button>
              <button
                type="button"
                disabled={drawerSelectedEps.length === 0}
                onClick={() => setDrawerSelectedEps([])}
                className="min-h-[36px] rounded-md border border-foreground/15 bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-40 sm:min-h-0"
              >
                {t("detail.clearSelection")}
              </button>
            </div>
            <Button
              type="button"
              variant="brand"
              size="sm"
              disabled={drawerSelectedEps.length === 0}
              onClick={startDrawerBatchDownload}
              className="min-h-[36px] gap-1.5 px-3 text-xs sm:min-h-0"
            >
              <Download className="size-3.5" />
              <span>
                {t("detail.downloadSelected").replace("{count}", String(drawerSelectedEps.length))}
              </span>
            </Button>
          </div>
        )}
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
            {drawerEpisodesList.map((item) => {
              const active = item.number === ep;
              const checked = drawerSelectedEps.includes(item.number);
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 transition",
                    drawerBatchMode && checked
                      ? "bg-cerulean/15 ring-1 ring-cerulean/50"
                      : active
                        ? "bg-cerulean/15 ring-1 ring-cerulean/40"
                        : "hover:bg-surface",
                  )}
                >
                  {drawerBatchMode ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={t("detail.selectEpisodeAria").replace(
                        "{ep}",
                        String(item.number),
                      )}
                      onClick={() => toggleDrawerEp(item.number)}
                      className="flex min-h-[44px] flex-1 items-center gap-2.5 text-left font-display text-sm font-semibold tabular-nums sm:min-h-0"
                    >
                      {checked ? (
                        <CheckSquare className="size-4 shrink-0 text-cerulean" />
                      ) : (
                        <Square className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span>
                        {t("detail.episode")} {item.number}
                      </span>
                    </button>
                  ) : (
                    <>
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
                        season={source === "anilist" ? 1 : season}
                        episode={item.number}
                        audio={audio}
                        includeSubtitles={includeSubtitles}
                        anilistId={canonicalAnilistId}
                        variant="icon"
                        compact
                      />
                    </>
                  )}
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
                subtitle={`${t("detail.episode")} ${ep} · ${aniAudioBadge}${
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
                onSwitchEmbed={aniEmbedUrl ? switchToEmbedMode : undefined}
                selectedSourceIndex={selectedSourceIndex}
                onSelectSourceIndex={setSelectedSourceIndex}
                skipIntroSeconds={settings.skipIntroSeconds}
                preferSubtitles={settings.autoShowSubtitles && !(lang === "en" && audio === "dub")}
                preferredAudioLang={audio === "dub" ? (lang === "fr" ? "fr" : "en") : "ja"}
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
                {t("detail.episode")} {ep} · {aniAudioBadge}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">{animeControls}</div>
        </div>
        {!detail.isLoading && !waitingForAnimeResolve && aniEmbedFallbacks.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 border-b border-foreground/5 bg-background/60 px-3 py-1.5">
            <span className="text-xs text-muted-foreground">
              {autoSwitchNote ?? t("watch.embedNotice")}
            </span>
            {aniEmbedFallbacks.map((fb, idx) => (
              <button
                key={fb.url}
                type="button"
                onClick={() => {
                  setIframeLoaded(false);
                  setEmbedIndex(idx);
                }}
                className={cn(
                  "inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1 text-xs font-semibold transition sm:min-h-8",
                  idx === safeAniEmbedIdx
                    ? "border-cerulean bg-brand-gradient text-primary-foreground"
                    : "border-foreground/15 bg-surface/80 text-muted-foreground hover:text-foreground",
                )}
              >
                {fb.available !== false && (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      idx === safeAniEmbedIdx ? "bg-primary-foreground" : "bg-emerald-400",
                    )}
                  />
                )}
                <span>{fb.label}</span>
              </button>
            ))}
            {aniEmbedFallbacks.length > 1 && aniEmbedUrl && (
              <button
                type="button"
                onClick={() => advanceEmbedServer(aniEmbedUrl, aniEmbedFallbacks)}
                className="min-h-[44px] whitespace-nowrap rounded-lg border border-foreground/15 bg-surface/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground sm:min-h-8"
              >
                {t("watch.nextServer")} →
              </button>
            )}
          </div>
        )}
        <div className="flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4">
          {detail.isLoading || waitingForAnimeResolve ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="size-12 animate-spin text-cerulean" />
              <p className="text-sm text-muted-foreground">
                {t("watch.loadingAudioEp")
                  .replace(
                    "{audio}",
                    lang === "fr" ? (audio === "dub" ? "VF" : "VOSTFR") : audio.toUpperCase(),
                  )
                  .replace("{ep}", String(ep))}
              </p>
            </div>
          ) : aniEmbedUrl ? (
            <EmbedPlayerFrame
              src={aniEmbedUrl}
              title={`${title || "Anime"} — ${t("detail.episode")} ${ep}`}
              className="h-full w-full max-w-7xl"
              onLoad={() => setIframeLoaded(true)}
              onError={() => advanceEmbedServer(aniEmbedUrl, aniEmbedFallbacks)}
            />
          ) : (
            <div className="flex max-w-md flex-col items-center gap-4 text-center">
              <p className="font-display text-xl font-semibold">
                {isFrenchDub
                  ? t("watch.vfUnavailable")
                  : aniStream.data?.error || t("watch.streamUnavailable")}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  variant="brand"
                  className="min-h-[44px]"
                  onClick={() => {
                    setFailedEmbedUrls([]);
                    setEmbedIndex(0);
                    void aniStream.refetch();
                  }}
                >
                  <RefreshCw className="size-4" /> {t("watch.retryStream")}
                </Button>
                <Button
                  variant="glass"
                  className="min-h-[44px]"
                  onClick={() => switchAudio(audio === "sub" ? "dub" : "sub")}
                >
                  {t("watch.switchTo")}{" "}
                  {audio === "sub"
                    ? lang === "fr"
                      ? "DUB · VF"
                      : "DUB"
                    : lang === "fr"
                      ? "SUB · VOSTFR"
                      : "SUB"}
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

  if (!useAnimePipeline && !streamUrl) {
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
      lang,
    });
    const rawEmbedFallbacks = mediaStream.data?.embedFallbacks?.length
      ? mediaStream.data.embedFallbacks
      : clientEmbedFallbacks;
    const embedFallbacks = rawEmbedFallbacks.filter((fb) => !failedEmbedUrls.includes(fb.url));
    const safeEmbedIdx = embedFallbacks.length
      ? Math.min(embedIndex, embedFallbacks.length - 1)
      : 0;
    const mediaEmbedUrl = embedFallbacks[safeEmbedIdx]?.url ?? null;
    activeEmbedTargetRef.current = {
      url: showNative ? null : mediaEmbedUrl,
      pool: embedFallbacks,
    };

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
        <LiveWatchingBadge count={liveWatchers} />
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
                onSwitchEmbed={mediaEmbedUrl ? switchToEmbedMode : undefined}
                selectedSourceIndex={selectedSourceIndex}
                onSelectSourceIndex={setSelectedSourceIndex}
                skipIntroSeconds={
                  settings.skipIntroSeconds === 0 ? 0 : isMovie ? 90 : settings.skipIntroSeconds
                }
                preferSubtitles={settings.autoShowSubtitles}
                preferredAudioLang={lang}
                topRight={mediaControls}
              />
            </Suspense>
          </div>
          <WatchDiscordPrompt />
          {mediaDrawer}
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
          embedFallbacks.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 border-b border-foreground/5 bg-background/60 px-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                {autoSwitchNote ?? t("watch.embedNotice")}
              </span>
              {embedFallbacks.map((fb, idx) => (
                <button
                  key={fb.url}
                  type="button"
                  onClick={() => {
                    setIframeLoaded(false);
                    setEmbedIndex(idx);
                  }}
                  className={cn(
                    "inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1 text-xs font-semibold transition sm:min-h-8",
                    idx === safeEmbedIdx
                      ? "border-cerulean bg-brand-gradient text-primary-foreground"
                      : "border-foreground/15 bg-surface/80 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {fb.available !== false && (
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        idx === safeEmbedIdx ? "bg-primary-foreground" : "bg-emerald-400",
                      )}
                    />
                  )}
                  <span>{fb.label}</span>
                </button>
              ))}
              {embedFallbacks.length > 1 && mediaEmbedUrl && (
                <button
                  type="button"
                  onClick={() => advanceEmbedServer(mediaEmbedUrl, embedFallbacks)}
                  className="min-h-[44px] whitespace-nowrap rounded-lg border border-foreground/15 bg-surface/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground sm:min-h-8"
                >
                  {t("watch.nextServer")} →
                </button>
              )}
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
            <EmbedPlayerFrame
              src={mediaEmbedUrl}
              title={isMovie ? `${title || "Movie"}` : `${title || "Series"} — S${season} E${ep}`}
              className="h-full w-full max-w-7xl"
              onLoad={() => setIframeLoaded(true)}
              onError={() => advanceEmbedServer(mediaEmbedUrl, embedFallbacks)}
            />
          ) : (
            <div className="flex max-w-md flex-col items-center gap-4 text-center">
              <p className="font-display text-xl font-semibold">
                {mediaStream.data?.error || t("watch.streamUnavailable")}
              </p>
              <Button
                variant="brand"
                className="min-h-[44px]"
                onClick={() => {
                  setFailedEmbedUrls([]);
                  setEmbedIndex(0);
                  if (!detail.data) void detail.refetch();
                  void mediaStream.refetch();
                }}
              >
                <RefreshCw className="size-4" /> {t("watch.retryStream")}
              </Button>
            </div>
          )}
        </div>
        <WatchDiscordPrompt />
        {mediaDrawer}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-scrim">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
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
            <p className="text-xs text-muted-foreground">{t("watch.nowPlaying")}</p>
          </div>
        </div>
        <LiveWatchingBadge count={liveWatchers} />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
        {detail.isLoading ? (
          <Loader2 className="size-12 animate-spin text-cerulean" />
        ) : streamUrl ? (
          <EmbedPlayerFrame
            src={streamUrl}
            title={title}
            className="aspect-video w-full max-w-6xl"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="font-display text-xl font-semibold">{t("watch.streamUnavailable")}</p>
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
