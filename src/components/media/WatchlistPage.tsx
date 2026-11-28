import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  Clapperboard,
  Download,
  HardDrive,
  Play,
  Smile,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MediaCard } from "@/components/media/MediaCard";
import { MediaImage } from "@/components/media/MediaImage";
import { Button } from "@/components/ui/button";
import { offlineLibrary, useOfflineLibrary } from "@/lib/download/offline-db";
import { useT, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useWatchlist, watchlist } from "@/lib/watchlist/store";

export type WatchlistFilter = "all" | "anime" | "cartoons" | "movies" | "series" | "offline";

const FILTERS: { id: WatchlistFilter; labelKey: TranslationKey }[] = [
  { id: "all", labelKey: "watchlist.filterAll" },
  { id: "offline", labelKey: "watchlist.filterOffline" },
  { id: "anime", labelKey: "watchlist.filterAnime" },
  { id: "cartoons", labelKey: "watchlist.filterCartoons" },
  { id: "movies", labelKey: "watchlist.filterMovies" },
  { id: "series", labelKey: "watchlist.filterSeries" },
];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1000 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export function WatchlistPage({ initialTab }: { initialTab?: WatchlistFilter | undefined }) {
  const { t } = useT();
  const entries = useWatchlist();
  const offlineEntries = useOfflineLibrary();
  const [filter, setFilter] = useState<WatchlistFilter>(initialTab ?? "all");

  useEffect(() => {
    if (initialTab) setFilter(initialTab);
  }, [initialTab]);

  const filtered = useMemo(() => {
    const items = entries.map((e) => e.item);
    switch (filter) {
      case "anime":
        return items.filter((i) => i.section === "anime");
      case "cartoons":
        return items.filter((i) => i.section === "cartoons");
      case "movies":
        return items.filter((i) => i.mediaType === "movie");
      case "series":
        return items.filter(
          (i) => i.mediaType !== "movie" && i.section !== "anime" && i.section !== "cartoons",
        );
      default:
        return items;
    }
  }, [entries, filter]);

  const showTabs = entries.length > 0 || offlineEntries.length > 0;
  const totalOfflineBytes = offlineEntries.reduce((sum, e) => sum + e.byteSize, 0);

  return (
    <div className="min-h-screen px-4 pb-16 pt-24 sm:px-8 lg:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-foreground/5 pb-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("watchlist.title")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {filter === "offline"
              ? offlineEntries.length === 0
                ? t("watchlist.offlineEmpty")
                : `${offlineEntries.length} ${t("watchlist.offlineStored")} · ${formatBytes(totalOfflineBytes)}`
              : entries.length === 0
                ? t("watchlist.emptySubtitle")
                : `${entries.length} ${
                    entries.length === 1 ? t("watchlist.titleSingular") : t("watchlist.titlePlural")
                  } ${t("watchlist.savedCountSuffix")}`}
          </p>
        </div>
        {filter === "offline"
          ? offlineEntries.length > 0 && (
              <Button
                type="button"
                variant="glass"
                size="sm"
                onClick={() => void offlineLibrary.clear()}
                className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
                <span>{t("watchlist.offlineClear")}</span>
              </Button>
            )
          : entries.length > 0 && (
              <Button
                type="button"
                variant="glass"
                size="sm"
                onClick={() => watchlist.clear()}
                className="rounded-full px-4 text-xs text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
                <span>{t("watchlist.clear")}</span>
              </Button>
            )}
      </div>

      {showTabs && (
        <div
          role="tablist"
          aria-label={t("watchlist.filterAria")}
          className="mt-6 flex flex-wrap items-center gap-2"
        >
          {FILTERS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-semibold transition sm:min-h-0",
                filter === tab.id
                  ? "border-cerulean bg-brand-gradient text-primary-foreground shadow-sm"
                  : "border-foreground/10 bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.id === "offline" && <HardDrive className="size-3.5" />}
              <span>{t(tab.labelKey)}</span>
              {tab.id === "offline" && offlineEntries.length > 0 && (
                <span className="ml-0.5 rounded-full bg-background/25 px-1.5 py-0.5 text-[10px] tabular-nums">
                  {offlineEntries.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {filter === "offline" ? (
        offlineEntries.length === 0 ? (
          <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-foreground/10 bg-surface/40 px-6 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-cerulean/15 text-cerulean">
              <HardDrive className="size-7" />
            </div>
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              {t("watchlist.offlineEmpty")}
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {offlineEntries.map((entry) => {
              const isMovie = entry.mediaType === "movie";
              const epLabel = isMovie
                ? t("watch.fullMovie")
                : entry.source === "anilist" || entry.season <= 1
                  ? `${t("detail.episode")} ${entry.episode}`
                  : `S${entry.season} · E${entry.episode}`;
              const audioLabel =
                entry.lang === "fr"
                  ? entry.audio === "dub"
                    ? "VF"
                    : "VOSTFR"
                  : entry.audio.toUpperCase();
              return (
                <div
                  key={entry.id}
                  className="flex gap-4 rounded-2xl border border-foreground/10 bg-surface/60 p-3.5 transition hover:border-cerulean/40"
                >
                  <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-scrim">
                    <MediaImage
                      src={entry.poster ?? null}
                      source={entry.source}
                      itemId={entry.itemId}
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                    <div>
                      <p className="line-clamp-1 font-display text-sm font-semibold">
                        {entry.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {epLabel} · {audioLabel} · {formatBytes(entry.byteSize)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        asChild
                        variant="brand"
                        size="sm"
                        className="min-h-9 gap-1.5 rounded-full px-3 text-xs"
                      >
                        <Link
                          to="/watch/$source/$id"
                          params={{ source: entry.source, id: entry.itemId }}
                          search={{
                            ep: entry.episode,
                            season: entry.season,
                            audio: entry.audio,
                            offline: entry.id,
                          }}
                        >
                          <Play className="size-3.5 fill-current" />
                          <span>{t("watchlist.playOffline")}</span>
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="glass"
                        size="sm"
                        onClick={() => void offlineLibrary.exportToDevice(entry.id)}
                        className="min-h-9 gap-1.5 rounded-full px-3 text-xs"
                      >
                        <Download className="size-3.5" />
                        <span>{t("watchlist.exportFile")}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t("watchlist.removeOffline")}
                        onClick={() => void offlineLibrary.remove(entry.id)}
                        className="min-h-9 rounded-full px-2.5 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : entries.length === 0 ? (
        <div className="mt-16 flex flex-col items-center justify-center rounded-2xl border border-foreground/10 bg-surface/40 px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-cerulean/15 text-cerulean">
            <Bookmark className="size-7" />
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold">{t("watchlist.emptyTitle")}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("watchlist.emptyBody")}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild variant="brand" size="lg">
              <Link to="/anime">
                <Sparkles /> {t("watchlist.browseAnime")}
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg">
              <Link to="/cartoons">
                <Smile /> {t("watchlist.browseCartoons")}
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg">
              <Link to="/hollywood">
                <Clapperboard /> {t("watchlist.browseMovies")}
              </Link>
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-foreground/10 bg-surface/40 px-6 py-12 text-center text-sm text-muted-foreground">
          {t("watchlist.noFilterMatch")}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((item) => (
            <MediaCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
