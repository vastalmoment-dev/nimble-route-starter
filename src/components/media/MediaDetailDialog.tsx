import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CaptionsOff, Clock, Film, Layers, Play, Star, Subtitles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { AdSlot } from "@/components/ads/AdSlot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { detailQuery } from "@/lib/catalog";
import { SECTION_META, itemKey, type MediaItem } from "@/lib/catalog/types";
import type { AudioOption } from "@/lib/stream/resolver";
import { cn } from "@/lib/utils";
import { DownloadButton } from "./DownloadButton";
import { MediaImage } from "./MediaImage";
import { useMediaModal } from "./MediaModalContext";
import { WatchlistButton } from "./WatchlistButton";

export function MediaDetailDialog({
  item,
  onClose,
}: {
  item: MediaItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl gap-0 overflow-y-auto border-foreground/10 bg-popover p-0 sm:rounded-2xl">
        {item && <DetailBody key={item.key} item={item} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const { open } = useMediaModal();
  const { data, isLoading, isError } = useQuery(detailQuery(item.source, item.id));
  const [showAll, setShowAll] = useState(false);
  const [audio, setAudio] = useState<AudioOption>("sub");
  const [includeSubtitles, setIncludeSubtitles] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  const isAnime = item.source === "anilist";
  const d = data ?? item;
  const allEpisodes = useMemo(() => data?.episodes ?? [], [data?.episodes]);
  const seasons = useMemo(() => {
    if (data?.seasons?.length) return data.seasons;
    const nums = [...new Set(allEpisodes.map((e) => e.season ?? 1))].sort((a, b) => a - b);
    return nums;
  }, [data?.seasons, allEpisodes]);

  const activeSeason = selectedSeason ?? seasons[0] ?? 1;
  const seasonEpisodes = useMemo(() => {
    if (isAnime || seasons.length <= 1) return allEpisodes;
    return allEpisodes.filter((e) => (e.season ?? 1) === activeSeason);
  }, [allEpisodes, isAnime, seasons.length, activeSeason]);

  const visible = showAll ? seasonEpisodes : seasonEpisodes.slice(0, 12);
  const meta = SECTION_META[item.section];
  const art = data?.backdrop ?? item.backdrop ?? item.posterHd ?? item.poster;
  const isMovie = d.mediaType === "movie";
  const firstEpisode = seasonEpisodes[0]?.number ?? 1;
  const relations = data?.relations ?? [];

  return (
    <div>
      <div className="relative aspect-video max-h-[46vh] w-full overflow-hidden bg-surface">
        <MediaImage
          src={art}
          fallbackSrc={item.posterHd ?? item.poster}
          source={item.source}
          itemId={item.id}
          className="size-full object-cover object-[center_25%]"
        />
        <div className="absolute inset-0 bg-hero-bottom" />
        <div className="absolute inset-x-0 bottom-0 space-y-4 p-6 sm:p-8">
          <span className={cn("text-xs font-bold uppercase tracking-[0.3em]", meta.colorClass)}>
            {meta.label}
          </span>
          <DialogTitle className="font-display text-3xl font-bold leading-tight sm:text-4xl">
            {d.title}
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="hero" size="xl">
              <Link
                to="/watch/$source/$id"
                params={{ source: item.source, id: item.id }}
                search={
                  isAnime
                    ? { ep: 1, audio }
                    : isMovie
                      ? { ep: 1 }
                      : { season: activeSeason, ep: firstEpisode }
                }
                onClick={onClose}
              >
                <Play /> {isMovie ? "Watch Movie" : "Watch Now"}
              </Link>
            </Button>
            <WatchlistButton item={d} />
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
              episode={firstEpisode}
              audio={audio}
              includeSubtitles={includeSubtitles}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[1fr_300px]">
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
          <DialogDescription className="text-base leading-relaxed text-foreground/85">
            {d.description || "No synopsis available yet."}
          </DialogDescription>
          <div className="flex flex-wrap gap-2">
            {d.genres.map((g) => (
              <span
                key={g}
                className="rounded-full border border-foreground/10 bg-surface px-3 py-1 text-xs"
              >
                {g}
              </span>
            ))}
          </div>

          {!isMovie && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-sm font-semibold">
                  Episodes{" "}
                  {seasonEpisodes.length ? (
                    <span className="text-muted-foreground">· {seasonEpisodes.length}</span>
                  ) : null}
                </h3>
                {!isAnime && seasons.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {seasons.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setSelectedSeason(s);
                          setShowAll(false);
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-semibold transition",
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
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="h-16 rounded-lg skeleton-shimmer" />
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
              {isAnime ? (
                <ol className="flex max-h-96 flex-col gap-1 overflow-y-auto pr-1">
                  {seasonEpisodes.map((ep) => (
                    <li
                      key={ep.id}
                      className="group/ep flex items-center justify-between rounded-lg border border-foreground/5 bg-surface/60 px-3 py-2 transition hover:border-cerulean/40 hover:bg-surface"
                    >
                      <Link
                        to="/watch/$source/$id"
                        params={{ source: item.source, id: item.id }}
                        search={{ ep: ep.number, audio }}
                        onClick={onClose}
                        className="flex flex-1 items-center font-display text-sm font-semibold tabular-nums"
                      >
                        {ep.number}
                      </Link>
                      <DownloadButton
                        item={d}
                        episode={ep.number}
                        audio={audio}
                        includeSubtitles={includeSubtitles}
                        variant="icon"
                        compact
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <>
                  <ol className="space-y-1.5">
                    {visible.map((ep) => (
                      <li
                        key={ep.id}
                        className="group/ep flex items-center gap-3 rounded-lg p-2 transition hover:bg-surface"
                      >
                        <span className="w-6 shrink-0 text-center font-display text-sm text-muted-foreground">
                          {ep.number}
                        </span>
                        <Link
                          to="/watch/$source/$id"
                          params={{ source: item.source, id: item.id }}
                          search={{ season: ep.season ?? activeSeason, ep: ep.number }}
                          onClick={onClose}
                          className="flex min-w-0 flex-1 items-center gap-3"
                        >
                          <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-surface">
                            {ep.thumbnail && (
                              <img
                                src={ep.thumbnail}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="size-full object-cover"
                              />
                            )}
                            <span className="absolute inset-0 flex items-center justify-center bg-scrim/50 opacity-0 transition group-hover/ep:opacity-100">
                              <Play className="size-4 fill-current" />
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{ep.title}</p>
                            {ep.runtime ? (
                              <p className="text-xs text-muted-foreground">{ep.runtime} min</p>
                            ) : null}
                          </div>
                        </Link>
                        <DownloadButton
                          item={d}
                          season={ep.season ?? activeSeason}
                          episode={ep.number}
                          audio={audio}
                          variant="icon"
                          compact
                        />
                      </li>
                    ))}
                  </ol>
                  {seasonEpisodes.length > 12 && (
                    <Button
                      variant="ghost"
                      className="mt-2 w-full"
                      onClick={() => setShowAll((s) => !s)}
                    >
                      {showAll ? "Show fewer" : `Show all ${seasonEpisodes.length} episodes`}
                    </Button>
                  )}
                </>
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
              <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
                <Layers className="size-4 text-cerulean" />{" "}
                {isAnime
                  ? "Season 2, Sequels & Future Seasons"
                  : isMovie
                    ? "Sequels, Future Releases & Series"
                    : "More Seasons, Sequels & Related"}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {relations.map((rel) => {
                  const isUpcoming =
                    rel.status === "not yet released" ||
                    rel.status === "upcoming" ||
                    rel.relationType.toLowerCase().includes("upcoming");
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
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(data?.cast.length ?? 0) > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
                <Users className="size-4 text-cerulean" /> Cast
              </h3>
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
          <div className="sticky top-6 space-y-4">
            <MediaImage
              src={item.posterHd ?? item.poster}
              fallbackSrc={item.poster}
              source={item.source}
              itemId={item.id}
              className="w-full rounded-xl shadow-card"
            />
            <AdSlot slot="rectangle" />
          </div>
        </div>
      </div>
    </div>
  );
}
