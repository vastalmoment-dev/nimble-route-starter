import { createFileRoute, Link } from "@tanstack/react-router";
import { Bookmark, Clapperboard, Smile, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { MediaCard } from "@/components/media/MediaCard";
import { Button } from "@/components/ui/button";
import { useWatchlist, watchlist } from "@/lib/watchlist/store";
import { cn } from "@/lib/utils";

type WatchlistFilter = "all" | "anime" | "cartoons" | "movies" | "series";

const FILTERS: { id: WatchlistFilter; label: string }[] = [
  { id: "all", label: "All Saved" },
  { id: "anime", label: "Anime" },
  { id: "cartoons", label: "Cartoons" },
  { id: "movies", label: "Movies" },
  { id: "series", label: "Shows & Dramas" },
];

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "My Watchlist — SHADOW" },
      {
        name: "description",
        content: "Quickly access your saved anime, cartoons, movies and series on SHADOW.",
      },
      { property: "og:title", content: "My Watchlist — SHADOW" },
      {
        property: "og:description",
        content: "Your personal local watchlist for anime, cartoons, movies and dramas.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: WatchlistPage,
});

function WatchlistPage() {
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
            My Watchlist
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {entries.length === 0
              ? "Save your favorite anime, cartoons, and movies here for instant playback."
              : `${entries.length} ${entries.length === 1 ? "title" : "titles"} saved in this browser`}
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
            <span>Clear Watchlist</span>
          </Button>
        )}
      </div>

      {entries.length > 0 && (
        <div
          role="tablist"
          aria-label="Filter watchlist"
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
                "whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                filter === tab.id
                  ? "border-cerulean bg-brand-gradient text-primary-foreground shadow-sm"
                  : "border-foreground/10 bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="mt-16 flex flex-col items-center justify-center rounded-2xl border border-foreground/10 bg-surface/40 px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-cerulean/15 text-cerulean">
            <Bookmark className="size-7" />
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold">Your watchlist is empty</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Tap the bookmark button on any anime, cartoon, or movie card to keep it handy right
            here.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild variant="brand" size="lg">
              <Link to="/anime">
                <Sparkles /> Browse Anime
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg">
              <Link to="/cartoons">
                <Smile /> Browse Cartoons
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg">
              <Link to="/hollywood">
                <Clapperboard /> Browse Movies
              </Link>
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-foreground/10 bg-surface/40 px-6 py-12 text-center text-sm text-muted-foreground">
          No saved titles match that filter yet.
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
