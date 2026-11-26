import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CaptionsOff,
  Clock,
  Film,
  Layers,
  Play,
  Star,
  Subtitles,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdSlot } from "@/components/ads/AdSlot";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { detailQuery } from "@/lib/catalog";
import { SECTION_META, itemKey, type MediaDetail, type MediaItem } from "@/lib/catalog/types";
import { playbackProgress, type LastWatchedEntry } from "@/lib/player/progress";
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
  onClose?: (() => void) | undefined;
  onBack?: (() => void) | undefined;
}

export function ShowDetailBody({
  item,
  mode = "modal",
  initialSeason,
  initialAudio,
  onClose,
  onBack,
}: ShowDetailBodyProps) {
  const { open } = useMediaModal();
  const { data, isLoading, isError } = useQuery(detailQuery(item.source, item.id));
  const [audio, setAudio] = useState<AudioOption>(initialAudio ?? "sub");
  const [includeSubtitles, setIncludeSubtitles] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(initialSeason ?? null);
  const [lastWatched, setLastWatched] = useState<LastWatchedEntry | null>(null);

  useEffect(() => {
    const saved = playbackProgress.getLastWatched(item.source, item.id);
    setLastWatched(saved);
    if (!initialSeason && saved?.season) {
      setSelectedSeason(saved.season);
    }
    if (!initialAudio && saved?.audio) {
      setAudio(saved.audio);
    }
  }, [item.source, item.id, initialSeason, initialAudio]);

  const isAnime = item.source === "anilist";
  const d: MediaItem | MediaDetail = data ?? item;

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
    if (isAnime || seasons.length <= 1) return allEpisodes;
    return allEpisodes
      .filter((e) => (e.season ?? 1) === activeSeason)
      .sort((a, b) => a.number - b.number);
  }, [allEpisodes, isAnime, seasons.length, activeSeason]);

  const meta = SECTION_META[d.section ?? item.section];
  const art = data?.backdrop ?? d.backdrop ?? d.posterHd ?? d.poster;
  const isMovie = d.mediaType === "movie";
  const firstEpisode = seasonEpisodes[0]?.number ?? 1;
  const relations = data?.relations ?? [];

  const resumeEp = lastWatched?.episode ?? firstEpisode;
  const resumeSeason = lastWatched?.season ?? activeSeason;

  const watchSearch = isAnime
    ? { ep: resumeEp, audio }
    : isMovie
      ? {}
      : { season: resumeSeason, ep: resumeEp };

  const primaryCtaLabel = lastWatched
    ? isMovie
      ? "Resume Movie"
      : !isAnime && seasons.length > 1
        ? `Resume S${resumeSeason} · E${resumeEp}`
        : `Resume Ep ${resumeEp}`
    : isMovie
      ? "Watch Movie"
      : "Watch Now";

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
            aria-label="Back to Home"
            className="gap-2 rounded-full px-4"
          >
            <ArrowLeft className="size-4" />
            <span>Back to Home</span>
          </Button>
          <span className={cn("text-xs font-bold uppercase tracking-[0.28em]", meta.colorClass)}>
            {meta.label}
          </span>
        </div>
      )}

      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden bg-surface",
          mode === "page" ? "max-h-[52vh] rounded-2xl border border-foreground/10" : "max-h-[46vh]",
        )}
      >
        <MediaImage
          src={art}
          fallbackSrc={d.posterHd ?? d.poster}
          source={item.source}
          itemId={item.id}
          imdbId={d.imdbId ?? item.imdbId}
          className="size-full object-cover object-[center_25%]"
        />
        <div className="absolute inset-0 bg-hero-bottom" />
        <div className="absolute inset-x-0 bottom-0 space-y-4 p-6 sm:p-8">
          <span className={cn("text-xs font-bold uppercase tracking-[0.3em]", meta.colorClass)}>
            {meta.label}
          </span>
          <TitleHeading className="font-display text-3xl font-bold leading-tight sm:text-4xl">
            {d.title}
          </TitleHeading>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="hero" size="xl">
              <Link
                to="/watch/$source/$id"
                params={{ source: item.source, id: item.id }}
                search={watchSearch}
                onClick={onClose}
              >
                <Play /> {primaryCtaLabel}
              </Link>
            </Button>
            <WatchlistButton item={d} />
            {!isAnime && <LanguageToggle />}
            {isAnime && (
              <>
                <div
                  role="group"
                  aria-label="Audio version"
                  className="inline-flex h-12 items-center rounded-full border border-foreground/15 bg-scrim/70 p-1 backdrop-blur-md"
                >
                  {(["sub", "dub"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAudio(opt)}
                      className={cn(
                        "rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition",
                        audio === opt
                          ? "bg-brand-gradient text-primary-foreground shadow-sm"
                          : "text-foreground/75 hover:text-foreground",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIncludeSubtitles((s) => !s)}
                  title="Choose whether downloaded episodes include subtitle files"
                  className={cn(
                    "inline-flex h-12 items-center gap-2 rounded-full border px-4 text-xs font-semibold backdrop-blur-md transition",
                    includeSubtitles
                      ? "border-cerulean/50 bg-cerulean/15 text-foreground"
                      : "border-foreground/15 bg-scrim/70 text-foreground/85 hover:text-foreground",
                  )}
                >
                  {includeSubtitles ? (
                    <>
                      <Subtitles className="size-4 text-cerulean" /> Download + Subs
                    </>
                  ) : (
                    <>
                      <CaptionsOff className="size-4 text-gold" /> No Subtitles
                    </>
                  )}
                </button>
              </>
            )}
            <DownloadButton
              item={d}
              season={isAnime || isMovie ? 1 : activeSeason}
              episode={resumeEp}
              audio={audio}
              includeSubtitles={includeSubtitles}
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
            {d.description || "No synopsis available yet."}
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
                  Episodes{" "}
                  {seasonEpisodes.length ? (
                    <span className="tabular-nums text-muted-foreground">
                      · {seasonEpisodes.length}
                    </span>
                  ) : null}
                </h2>
                {!isAnime && seasons.length > 1 && (
                  <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Seasons">
                    {seasons.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="tab"
                        aria-selected={activeSeason === s}
                        onClick={() => setSelectedSeason(s)}
                        className={cn(
                          "rounded-md border px-3 py-1 text-xs font-semibold tabular-nums transition",
                          activeSeason === s
                            ? "border-cerulean bg-brand-gradient text-primary-foreground"
                            : "border-foreground/10 bg-surface text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Season {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="h-10 rounded-lg skeleton-shimmer" />
                  ))}
                </div>
              )}
              {isError && (
                <p className="text-sm text-muted-foreground">
                  Episode list is unavailable right now.
                </p>
              )}
              {!isLoading && !isError && seasonEpisodes.length === 0 && seasons.length > 1 && (
                <p className="rounded-xl border border-foreground/10 bg-surface/50 px-4 py-3 text-sm text-muted-foreground">
                  Season {activeSeason} is announced or upcoming — episodes will appear
                  automatically once released.
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
                    return (
                      <li
                        key={ep.id}
                        className={cn(
                          "group/ep flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition",
                          isLastWatched
                            ? "border-cerulean/50 bg-cerulean/10"
                            : "border-foreground/5 bg-surface/60 hover:border-cerulean/40 hover:bg-surface",
                        )}
                      >
                        <Link
                          to="/watch/$source/$id"
                          params={{ source: item.source, id: item.id }}
                          search={
                            isAnime ? { ep: ep.number, audio } : { season: epSeason, ep: ep.number }
                          }
                          onClick={onClose}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                          season={isAnime ? 1 : epSeason}
                          episode={ep.number}
                          audio={audio}
                          includeSubtitles={includeSubtitles}
                          variant="icon"
                          compact
                        />
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
              <span>Full feature movie ready to watch or download offline.</span>
            </div>
          )}

          {relations.length > 0 && (
            <div>
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
                <Layers className="size-4 text-cerulean" />{" "}
                {isAnime
                  ? "Season 2, Sequels & Future Seasons"
                  : isMovie
                    ? "Sequels, Future Releases & Series"
                    : "More Seasons, Sequels & Related"}
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
                            ? "Upcoming release"
                            : rel.episodesCount
                              ? `${rel.episodesCount} ${rel.episodesCount === 1 ? "episode" : "episodes"}`
                              : rel.mediaType === "movie"
                                ? "Feature movie"
                                : "View details"}
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
                <Users className="size-4 text-cerulean" /> Cast
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
            <AdSlot slot="rectangle" />
          </div>
        </div>
      </div>
    </div>
  );
}
