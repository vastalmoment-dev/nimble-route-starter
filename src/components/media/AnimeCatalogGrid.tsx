import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ["anime-all", sort],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchAllAnimePage({
        page: pageParam,
        perPage: 36,
        sort,
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
              ? `${totalAvailable.toLocaleString()} titles · Full seasons & episodes with Sub & Dub`
              : "Browse the complete anime catalog with Sub & Dub playback"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-2xl border border-foreground/10 bg-surface p-1 sm:rounded-full">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSort(s.id)}
              className={cn(
                "min-h-[44px] rounded-full px-3 py-1.5 text-xs font-medium transition sm:min-h-0 sm:py-1",
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

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 18 }, (_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-foreground/5 bg-surface/40 py-14 text-center text-sm text-muted-foreground">
          No anime matched those genres yet — try clearing the genre chips above.
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
