import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { filterByGenres, type GenreChipId } from "@/lib/catalog";
import { fetchAllAnimePage, type AnimeBrowseSort } from "@/lib/catalog/anilist";
import { cn } from "@/lib/utils";
import { MediaCard, MediaCardSkeleton } from "./MediaCard";

const SORTS: { id: AnimeBrowseSort; label: string }[] = [
  { id: "POPULARITY_DESC", label: "Most Popular" },
  { id: "TRENDING_DESC", label: "Trending" },
  { id: "START_DATE_DESC", label: "Newest" },
  { id: "SCORE_DESC", label: "Top Rated" },
  { id: "TITLE_ROMAJI", label: "A–Z" },
];

export function AnimeCatalogGrid({ genres }: { genres: GenreChipId[] }) {
  const [sort, setSort] = useState<AnimeBrowseSort>("POPULARITY_DESC");
  const [filterText, setFilterText] = useState("");
  const queryText = filterText.trim();

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["anime-all", sort, queryText],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchAllAnimePage({
        page: pageParam,
        perPage: 36,
        sort,
        ...(queryText ? { search: queryText } : {}),
      }),
    getNextPageParam: (last) => (last.hasNextPage ? last.currentPage + 1 : undefined),
    staleTime: 1000 * 60 * 5,
  });

  const items = useMemo(() => {
    const seen = new Set<string>();
    const merged = (data?.pages ?? [])
      .flatMap((p) => p.items)
      .filter((item) => {
        if (seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
      });
    return filterByGenres(merged, genres);
  }, [data, genres]);

  const totalAvailable = data?.pages[0]?.total;

  return (
    <section className="space-y-5 px-4 pt-6 sm:px-8 lg:px-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold sm:text-2xl">All Anime</h2>
          <p className="text-xs text-muted-foreground">
            {totalAvailable
              ? `${totalAvailable.toLocaleString()} titles · Full episodes with Sub & Dub`
              : "Browse the complete AniList catalog with Sub & Dub playback"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex h-9 items-center rounded-full border border-foreground/10 bg-surface px-3">
            <Search className="mr-2 size-3.5 text-muted-foreground" />
            <input
              type="search"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter all anime…"
              aria-label="Filter all anime"
              className="w-40 bg-transparent text-xs outline-none placeholder:text-muted-foreground sm:w-48"
            />
          </label>
          <div className="flex flex-wrap gap-1 rounded-full border border-foreground/10 bg-surface p-1">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSort(s.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  sort === s.id
                    ? "bg-brand-gradient font-semibold text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 18 }, (_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-foreground/5 bg-surface/40 py-14 text-center text-sm text-muted-foreground">
          No anime matched that filter — try clearing the search or genre chips.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {items.map((item) => (
              <MediaCard key={item.key} item={item} />
            ))}
          </div>
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                type="button"
                variant="glass"
                size="xl"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="animate-spin" /> Loading more anime…
                  </>
                ) : (
                  `Load more anime (${items.length} shown)`
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
