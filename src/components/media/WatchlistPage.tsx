import { Link } from "@tanstack/react-router";
import { Bookmark, Clapperboard, Smile, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { MediaCard } from "@/components/media/MediaCard";
import { Button } from "@/components/ui/button";
import { useT, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useWatchlist, watchlist } from "@/lib/watchlist/store";

type WatchlistFilter = "all" | "anime" | "cartoons" | "movies" | "series";

const FILTERS: { id: WatchlistFilter; labelKey: TranslationKey }[] = [
  { id: "all", labelKey: "watchlist.filterAll" },
  { id: "anime", labelKey: "watchlist.filterAnime" },
  { id: "cartoons", labelKey: "watchlist.filterCartoons" },
  { id: "movies", labelKey: "watchlist.filterMovies" },
  { id: "series", labelKey: "watchlist.filterSeries" },
];

export function WatchlistPage() {
  const { t } = useT();
  const entries = useWatchlist();
  const [filter, setFilter] = useState<WatchlistFilter>("all");

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

  return (
    <div className="min-h-screen px-4 pb-16 pt-24 sm:px-8 lg:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-foreground/5 pb-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t("watchlist.title")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {entries.length === 0
              ? t("watchlist.emptySubtitle")
              : `${entries.length} ${
                  entries.length === 1 ? t("watchlist.titleSingular") : t("watchlist.titlePlural")
                } ${t("watchlist.savedCountSuffix")}`}
          </p>
        </div>
        {entries.length > 0 && (
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

      {entries.length > 0 && (
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
                "min-h-[44px] whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-semibold transition sm:min-h-0",
                filter === tab.id
                  ? "border-cerulean bg-brand-gradient text-primary-foreground shadow-sm"
                  : "border-foreground/10 bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
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
