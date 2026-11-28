import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CaptionsOff,
  CheckSquare,
  Clock,
  Download,
  Film,
  Layers,
  Play,
  Square,
  Star,
  Subtitles,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdSlot } from "@/components/ads/AdSlot";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { detailQuery } from "@/lib/catalog";
import { isAnimeItem, resolveAniListIdForItem } from "@/lib/catalog/anime-bridge";
import { SECTION_META, itemKey, type MediaDetail, type MediaItem } from "@/lib/catalog/types";
import { downloads } from "@/lib/download/store";
import { getSectionMeta, useT } from "@/lib/i18n";
import { playbackProgress, type LastWatchedEntry } from "@/lib/player/progress";
import { resolvePreferredAnimeAudio, useUserSettings } from "@/lib/settings/store";
import type { AudioOption } from "@/lib/stream/resolver";
import { cn } from "@/lib/utils";
import { DownloadButton } from "./DownloadButton";
import { LanguageToggle } from "./LanguageToggle";
import { MediaImage } from "./MediaImage";
import { useMediaModal } from "./MediaModalContext";
import { WatchlistButton } from "./WatchlistButton";

function cleanEpisodeLabel(rawTitle: string | undefined, epNumber: number): string | null {
  if (!rawTitle) return null;
  const stripped = rawTitle.replace(/^S\d+·E\d+\s*[—–-]\s*/i, "").trim();
  if (!stripped) return null;
  if (new RegExp(`^Episode\\s*${epNumber}$`, "i").test(stripped)) return null;
  return stripped;
}

export interface ShowDetailBodyProps {
  item: MediaItem;
  mode?: "modal" | "page";
  initialSeason?: number | undefined;
  initialAudio?: AudioOption | undefined;
  backLabel?: string | undefined;
  onClose?: (() => void) | undefined;
  onBack?: (() => void) | undefined;
}

export function ShowDetailBody({
  item,
  mode = "modal",
  initialSeason,
  initialAudio,
  backLabel,
  onClose,
  onBack,
}: ShowDetailBodyProps) {
  const { lang, t } = useT();
  const { open } = useMediaModal();
  const { data, isLoading, isError } = useQuery(detailQuery(item.source, item.id, lang));
  const settings = useUserSettings();
  const [audio, setAudio] = useState<AudioOption>(() =>
    resolvePreferredAnimeAudio({
      explicitAudio: initialAudio,
      lastWatched:
        typeof window !== "undefined"
          ? playbackProgress.getLastWatched(item.source, item.id)
          : null,
      settings,
    }),
  );
  const [includeSubtitles, setIncludeSubtitles] = useState(() => settings.downloadIncludeSubtitles);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(initialSeason ?? null);
  const [lastWatched, setLastWatched] = useState<LastWatchedEntry | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedEpisodes, setSelectedEpisodes] = useState<number[]>([]);

  useEffect(() => {
    setBatchMode(false);
    setSelectedEpisodes([]);
    const saved = playbackProgress.getLastWatched(item.source, item.id);
    setLastWatched(saved);
    if (!initialSeason && saved?.season) {
      setSelectedSeason(saved.season);
    }
    setAudio(
      resolvePreferredAnimeAudio({
        explicitAudio: initialAudio,
        lastWatched: saved,
        settings,
      }),
    );
    setIncludeSubtitles(settings.downloadIncludeSubtitles);
  }, [
    item.source,
    item.id,
    initialSeason,
    initialAudio,
    settings.defaultAnimeAudio,
    settings.defaultAnimeAudioUpdatedAt,
    settings.downloadIncludeSubtitles,
  ]);

  const d: MediaItem | MediaDetail = data ?? item;
  const isAnime = isAnimeItem(d);
  const bridgedAnilist = useQuery({
    queryKey: ["anime-bridge", item.source, item.id, d.imdbId ?? null, d.title],
    queryFn: () =>
      resolveAniListIdForItem({
        source: item.source,
        id: item.id,
        title: d.title,
        englishTitle: d.englishTitle,
        imdbId: d.imdbId,
      }),
    enabled: isAnime && item.source !== "anilist" && Boolean(d.imdbId || d.title),
    staleTime: 1000 * 60 * 60,
  });
  const resolvedAnilistId = item.source === "anilist" ? item.id : (bridgedAnilist.data ?? null);

  const allEpisodes = useMemo(() => {
    const list = data?.episodes ?? [];
    return [...list].sort((a, b) => (a.season ?? 1) - (b.season ?? 1) || a.number - b.number);
  }, [data?.episodes]);

  const seasons = useMemo(() => {
    if (data?.seasons?.length) return [...data.seasons].sort((a, b) => a - b);
    return [...new Set(allEpisodes.map((e) => e.season ?? 1))].sort((a, b) => a - b);
  }, [data?.seasons, allEpisodes]);

  const activeSeason =
    selectedSeason != null && (seasons.length === 0 || seasons.includes(selectedSeason))
      ? selectedSeason
      : (seasons[0] ?? 1);

  const seasonEpisodes = useMemo(() => {
    if (item.source === "anilist" || seasons.length <= 1) return allEpisodes;
    return allEpisodes
      .filter((e) => (e.season ?? 1) === activeSeason)
      .sort((a, b) => a.number - b.number);
  }, [allEpisodes, item.source, seasons.length, activeSeason]);

  const meta = SECTION_META[d.section ?? item.section];
  const localizedMeta = getSectionMeta(d.section ?? item.section, lang);
  const art = data?.backdrop ?? d.backdrop ?? d.posterHd ?? d.poster;
  const isMovie = d.mediaType === "movie";
  const firstEpisode = seasonEpisodes[0]?.number ?? 1;
  const relations = data?.relations ?? [];

  const resumeEp = lastWatched?.episode ?? firstEpisode;
  const resumeSeason = lastWatched?.season ?? activeSeason;

  const watchSearch = isAnime
    ? isMovie
      ? { audio }
      : seasons.length > 1
        ? { season: resumeSeason, ep: resumeEp, audio }
        : { ep: resumeEp, audio }
    : isMovie
      ? {}
      : { season: resumeSeason, ep: resumeEp };

  const primaryCtaLabel = lastWatched
    ? isMovie
      ? t("common.resumeMovie")
      : !isAnime && seasons.length > 1
        ? `${t("common.resume")} S${resumeSeason} · E${resumeEp}`
        : `${t("common.resume")} ${lang === "fr" ? "Ép." : "Ep"} ${resumeEp}`
    : isMovie
      ? t("common.watchMovie")
      : t("common.watchNow");

  const TitleHeading = mode === "modal" ? DialogTitle : "h1";
  const SynopsisEl = mode === "modal" ? DialogDescription : "p";

  return (
    <div>
      {mode === "page" && onBack && (
        <div className="mb-4 flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="glass"
            size="sm"
            onClick={onBack}
            aria-label={backLabel || t("common.backHome")}
            className="min-h-[44px] gap-2 rounded-full px-4 sm:min-h-0"
          >
            <ArrowLeft className="size-4" />
            <span>{backLabel || t("common.backHome")}</span>
          </Button>
          <span className={cn("text-xs font-bold uppercase tracking-[0.28em]", meta.colorClass)}>
            {localizedMeta?.label ?? meta.label}
          </span>
        </div>
      )}

      <div
        className={cn(
          "relative flex min-h-[360px] w-full flex-col justify-end overflow-hidden bg-surface sm:block sm:aspect-video sm:min-h-0",
          mode === "page"
            ? "rounded-2xl border border-foreground/10 sm:max-h-[56vh]"
            : "sm:max-h-[50vh]",
        )}
      >
        <MediaImage
          src={art}
          fallbackSrc={d.posterHd ?? d.poster}
          source={item.source}
          itemId={item.id}
          imdbId={d.imdbId ?? item.imdbId}
          loading="eager"
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover object-[center_25%]"
        />
        <div className="absolute inset-0 bg-hero-bottom" />
        <div className="relative z-10 space-y-3 p-4 pt-20 sm:absolute sm:inset-x-0 sm:bottom-0 sm:space-y-4 sm:p-8">
          <span className={cn("text-xs font-bold uppercase tracking-[0.3em]", meta.colorClass)}>
            {localizedMeta?.label ?? meta.label}
          </span>
          <TitleHeading className="font-display text-2xl font-bold leading-tight sm:text-4xl">
            {d.title}
          </TitleHeading>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button asChild variant="hero" size="xl">
              <Link
                to="/watch/$source/$id"
                params={{ source: item.source, id: item.id }}
                search={watchSearch}
                onClick={() => {
                  playbackProgress.save({
                    source: item.source,
                    id: item.id,
                    season: isMovie ? 1 : resumeSeason,
                    episode: isMovie ? 1 : resumeEp,
                    currentTime: 0,
                    audio: isAnime ? audio : undefined,
                    item: d,
                  });
                  onClose?.();
                }}
              >
                <Play /> {primaryCtaLabel}
              </Link>
            </Button>
            <WatchlistButton item={d} />
            <LanguageToggle />
            {isAnime && (
              <>
                <div
                  role="group"
                  aria-label={t("detail.audioVersion")}
                  className="inline-flex h-12 items-center rounded-full border border-foreground/15 bg-scrim/70 p-1 backdrop-blur-md"
                >
                  {(["sub", "dub"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAudio(opt)}
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
                        "rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition",
                        audio === opt
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
                <button
                  type="button"
                  onClick={() => setIncludeSubtitles((s) => !s)}
                  title={t("detail.subsToggleHint")}
                  className={cn(
                    "inline-flex h-12 items-center gap-2 rounded-full border px-4 text-xs font-semibold backdrop-blur-md transition",
                    includeSubtitles
                      ? "border-cerulean/50 bg-cerulean/15 text-foreground"
                      : "border-foreground/15 bg-scrim/70 text-foreground/85 hover:text-foreground",
                  )}
                >
                  {includeSubtitles ? (
                    <>
                      <Subtitles className="size-4 text-cerulean" /> {t("detail.downloadPlusSubs")}
                    </>
                  ) : (
                    <>
                      <CaptionsOff className="size-4 text-gold" /> {t("detail.noSubtitles")}
                    </>
                  )}
                </button>
              </>
            )}
            <DownloadButton
              item={d}
              season={item.source === "anilist" || isMovie ? 1 : activeSeason}
              episode={resumeEp}
              audio={audio}
              includeSubtitles={includeSubtitles}
              anilistId={resolvedAnilistId}
            />
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-8 md:grid-cols-[1fr_300px]",
          mode === "page" ? "py-8" : "p-6 sm:p-8",
        )}
      >
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {d.rating ? (
              <span className="inline-flex items-center gap-1 font-semibold text-gold">
                <Star className="size-4 fill-current" /> {d.rating.toFixed(1)}
              </span>
            ) : null}
            {d.year && <span>{d.year}</span>}
            {d.runtime ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> {d.runtime} min
              </span>
            ) : null}
            {d.network && <span>{d.network}</span>}
            {d.status && <span className="capitalize">{d.status}</span>}
          </div>
          <SynopsisEl className="text-base leading-relaxed text-foreground/85">
            {d.description || t("detail.noSynopsis")}
          </SynopsisEl>
          {d.genres.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {d.genres.map((g, idx) => (
                <span key={g} className="inline-flex items-center gap-2">
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <span className="text-foreground/80">{g}</span>
                </span>
              ))}
            </div>
          )}

          {!isMovie && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold">
                  {t("detail.episodes")}{" "}
                  {seasonEpisodes.length ? (
                    <span className="tabular-nums text-muted-foreground">
                      · {seasonEpisodes.length}
                    </span>
                  ) : null}
                </h2>
                {isAnime && seasonEpisodes.length > 0 && (
                  <Button
                    type="button"
                    variant={batchMode ? "brand" : "glass"}
                    size="sm"
                    onClick={() => {
                      setBatchMode((prev) => {
                        if (prev) setSelectedEpisodes([]);
                        return !prev;
                      });
                    }}
                    className="min-h-[44px] gap-1.5 rounded-full px-3.5 text-xs sm:min-h-8"
                  >
                    <CheckSquare className="size-3.5" />
                    <span>{batchMode ? t("detail.cancelSelect") : t("detail.selectEpisodes")}</span>
                  </Button>
                )}
                {item.source !== "anilist" && seasons.length > 1 && (
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="tablist"
                    aria-label={t("detail.seasons")}
                  >
                    {seasons.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="tab"
                        aria-selected={activeSeason === s}
                        onClick={() => setSelectedSeason(s)}
                        className={cn(
                          "min-h-[44px] rounded-md border px-3 py-1.5 text-xs font-semibold tabular-nums transition sm:min-h-0 sm:py-1",
                          activeSeason === s
                            ? "border-cerulean bg-brand-gradient text-primary-foreground"
                            : "border-foreground/10 bg-surface text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t("detail.season")} {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {isAnime && batchMode && seasonEpisodes.length > 0 && (
                <div
                  data-testid="anime-batch-toolbar"
                  className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-foreground/10 bg-surface/75 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedEpisodes(seasonEpisodes.map((ep) => ep.number))}
                      className="min-h-[44px] rounded-md border border-foreground/15 bg-background/60 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-cerulean/50 sm:min-h-8 sm:py-1"
                    >
                      {t("detail.selectAll")}
                    </button>
                    <button
                      type="button"
                      disabled={selectedEpisodes.length === 0}
                      onClick={() => setSelectedEpisodes([])}
                      className="min-h-[44px] rounded-md border border-foreground/15 bg-background/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-40 sm:min-h-8 sm:py-1"
                    >
                      {t("detail.clearSelection")}
                    </button>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {t("detail.selectedCount").replace(
                        "{count}",
                        String(selectedEpisodes.length),
                      )}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    disabled={selectedEpisodes.length === 0}
                    onClick={() => {
                      const sorted = [...selectedEpisodes].sort((a, b) => a - b);
                      if (!sorted.length) return;
                      void downloads.startBatch(
                        sorted.map((epNum) => ({
                          source: d.source,
                          id: d.id,
                          episode: epNum,
                          season: item.source === "anilist" ? 1 : activeSeason,
                          mediaType: d.mediaType,
                          title: d.title,
                          poster: d.poster ?? null,
                          audio,
                          includeSubtitles,
                          lang,
                          isAnime,
                          anilistId: resolvedAnilistId,
                          malId: d.malId,
                          imdbId: d.imdbId,
                          tmdbId: d.tmdbId,
                          englishTitle: d.englishTitle,
                          romajiTitle: d.romajiTitle,
                        })),
                      );
                      setBatchMode(false);
                      setSelectedEpisodes([]);
                    }}
                    className="min-h-[44px] gap-1.5 rounded-full px-4 text-xs sm:min-h-8"
                  >
                    <Download className="size-3.5" />
                    <span>
                      {t("detail.downloadSelected").replace(
                        "{count}",
                        String(selectedEpisodes.length),
                      )}
                    </span>
                  </Button>
                </div>
              )}
              {isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="h-10 rounded-lg skeleton-shimmer" />
                  ))}
                </div>
              )}
              {isError && (
                <p className="text-sm text-muted-foreground">{t("detail.episodesUnavailable")}</p>
              )}
              {!isLoading && !isError && seasonEpisodes.length === 0 && seasons.length > 1 && (
                <p className="rounded-xl border border-foreground/10 bg-surface/50 px-4 py-3 text-sm text-muted-foreground">
                  {t("detail.upcomingSeasonStart")} {activeSeason} {t("detail.upcomingSeasonEnd")}
                </p>
              )}
              {!isLoading && !isError && seasonEpisodes.length > 0 && (
                <ol
                  data-testid="ordered-episode-list"
                  className="flex max-h-96 flex-col gap-1 overflow-y-auto pr-1"
                >
                  {seasonEpisodes.map((ep) => {
                    const epSeason = ep.season ?? activeSeason;
                    const isLastWatched =
                      lastWatched != null &&
                      lastWatched.episode === ep.number &&
                      (isAnime || lastWatched.season === epSeason);
                    const subtitleText = isAnime ? null : cleanEpisodeLabel(ep.title, ep.number);
                    const isSelected = isAnime && batchMode && selectedEpisodes.includes(ep.number);
                    return (
                      <li
                        key={ep.id}
                        className={cn(
                          "group/ep flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition",
                          isSelected
                            ? "border-cerulean bg-cerulean/15"
                            : isLastWatched
                              ? "border-cerulean/50 bg-cerulean/10"
                              : "border-foreground/5 bg-surface/60 hover:border-cerulean/40 hover:bg-surface",
                        )}
                      >
                        {isAnime && batchMode ? (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isSelected}
                            aria-label={t("detail.selectEpisodeAria").replace(
                              "{ep}",
                              String(ep.number),
                            )}
                            onClick={() =>
                              setSelectedEpisodes((prev) =>
                                prev.includes(ep.number)
                                  ? prev.filter((n) => n !== ep.number)
                                  : [...prev, ep.number],
                              )
                            }
                            className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left sm:min-h-0"
                          >
                            {isSelected ? (
                              <CheckSquare className="size-4 shrink-0 text-cerulean" />
                            ) : (
                              <Square className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="font-display text-sm font-semibold tabular-nums">
                              {t("detail.episode")} {ep.number}
                            </span>
                          </button>
                        ) : (
                          <>
                            <Link
                              to="/watch/$source/$id"
                              params={{ source: item.source, id: item.id }}
                              search={
                                isAnime
                                  ? seasons.length > 1
                                    ? { season: epSeason, ep: ep.number, audio }
                                    : { ep: ep.number, audio }
                                  : { season: epSeason, ep: ep.number }
                              }
                              onClick={onClose}
                              className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left sm:min-h-0"
                            >
                              <span className="flex w-8 shrink-0 items-center gap-1.5 font-display text-sm font-semibold tabular-nums">
                                {isLastWatched && (
                                  <Play className="size-3 shrink-0 fill-current text-cerulean" />
                                )}
                                <span>{ep.number}</span>
                              </span>
                              {subtitleText && (
                                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground group-hover/ep:text-foreground/85">
                                  {subtitleText}
                                </span>
                              )}
                            </Link>
                            <DownloadButton
                              item={d}
                              season={item.source === "anilist" ? 1 : epSeason}
                              episode={ep.number}
                              audio={audio}
                              includeSubtitles={includeSubtitles}
                              anilistId={resolvedAnilistId}
                              variant="icon"
                              compact
                            />
                          </>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}

          {isMovie && (
            <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-surface/50 px-4 py-3 text-sm text-muted-foreground">
              <Film className="size-4 text-cerulean" />
              <span>{t("detail.featureMovieReady")}</span>
            </div>
          )}

          {relations.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
                <Layers className="size-4 text-cerulean" />{" "}
                {isAnime
                  ? t("detail.relationsAnime")
                  : isMovie
                    ? t("detail.relationsMovie")
                    : t("detail.relationsDefault")}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {relations.map((rel) => {
                  const isUpcoming =
                    rel.status === "not yet released" ||
                    rel.status === "upcoming" ||
                    rel.relationType.toLowerCase().includes("upcoming");
                  const cardInner = (
                    <>
                      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-scrim">
                        <MediaImage
                          src={rel.poster}
                          source={rel.source}
                          itemId={rel.id}
                          className="size-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-wider",
                            isUpcoming ? "text-gold" : "text-cerulean",
                          )}
                        >
                          {rel.relationType}
                          {rel.year ? ` · ${rel.year}` : ""}
                        </p>
                        <p className="line-clamp-1 text-sm font-semibold">{rel.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {isUpcoming
                            ? t("detail.upcomingRelease")
                            : rel.episodesCount
                              ? `${rel.episodesCount} ${
                                  rel.episodesCount === 1
                                    ? t("detail.episodeLower")
                                    : t("detail.episodesLower")
                                }`
                              : rel.mediaType === "movie"
                                ? t("detail.featureMovie")
                                : t("detail.viewDetails")}
                        </p>
                      </div>
                    </>
                  );

                  if (mode === "page") {
                    return (
                      <Link
                        key={`${rel.source}-${rel.id}`}
                        to="/title/$source/$id"
                        params={{ source: rel.source, id: rel.id }}
                        className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-surface/60 p-2.5 text-left transition hover:border-cerulean/50 hover:bg-surface"
                      >
                        {cardInner}
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={`${rel.source}-${rel.id}`}
                      type="button"
                      onClick={() =>
                        open({
                          key: itemKey(rel.source, rel.id),
                          id: rel.id,
                          source: rel.source,
                          section: rel.section ?? item.section,
                          title: rel.title,
                          poster: rel.poster ?? item.poster,
                          posterHd: rel.poster ?? item.posterHd ?? null,
                          backdrop: item.backdrop ?? null,
                          year: rel.year ?? null,
                          genres: item.genres,
                          description: "",
                          episodesCount: rel.episodesCount ?? null,
                          mediaType: rel.mediaType ?? (rel.format === "MOVIE" ? "movie" : "tv"),
                        })
                      }
                      className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-surface/60 p-2.5 text-left transition hover:border-cerulean/50 hover:bg-surface"
                    >
                      {cardInner}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(data?.cast.length ?? 0) > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
                <Users className="size-4 text-cerulean" /> {t("detail.cast")}
              </h2>
              <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
                {data!.cast.map((c) => (
                  <div key={`${c.name}-${c.role}`} className="w-20 shrink-0 text-center">
                    <div className="mx-auto size-16 overflow-hidden rounded-full bg-surface ring-1 ring-foreground/10">
                      {c.image && (
                        <img
                          src={c.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="size-full object-cover"
                        />
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-medium">{c.name}</p>
                    {c.role && (
                      <p className="line-clamp-1 text-[11px] capitalize text-muted-foreground">
                        {c.role}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center pt-2 md:hidden">
            <AdSlot slot="sidebar" />
          </div>
        </div>
        <div className="hidden md:block">
          <div className="sticky top-20 space-y-4">
            <MediaImage
              src={d.posterHd ?? d.poster}
              fallbackSrc={d.poster}
              source={item.source}
              itemId={item.id}
              imdbId={d.imdbId ?? item.imdbId}
              className="w-full rounded-xl shadow-card"
            />
            <div className="flex justify-center">
              <AdSlot slot="sidebar" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
