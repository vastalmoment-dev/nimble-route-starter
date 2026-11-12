import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { AdSlot } from "@/components/ads/AdSlot";
import { PromoBanner } from "@/components/ads/PromoBanner";
import { Button } from "@/components/ui/button";
import { filterByGenres, sectionQuery, type GenreChipId } from "@/lib/catalog";
import { SECTION_META, type SectionId } from "@/lib/catalog/types";
import { GenreChips } from "./GenreChips";
import { HeroCarousel, HeroSkeleton } from "./HeroCarousel";
import { Shelf, ShelfSkeleton } from "./Shelf";

export function SectionPage({ section }: { section: SectionId | "home" }) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery(sectionQuery(section));
  const [genres, setGenres] = useState<GenreChipId[]>([]);

  const shelves = useMemo(
    () =>
      (data?.shelves ?? [])
        .map((s) => ({ ...s, items: filterByGenres(s.items, genres) }))
        .filter((s) => s.items.length > 0),
    [data, genres],
  );

  if (isLoading) {
    return (
      <div>
        <HeroSkeleton />
        <div className="-mt-16 space-y-8">
          {Array.from({ length: 3 }, (_, i) => (
            <ShelfSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="font-display text-2xl font-bold">This shelf went dark</h1>
        <p className="max-w-sm text-muted-foreground">We couldn't reach the catalog just now. Check your connection and try again.</p>
        <Button variant="brand" size="xl" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Try again
        </Button>
      </div>
    );
  }

  const meta = section === "home" ? null : SECTION_META[section];

  return (
    <div>
      <HeroCarousel items={data.featured} />
      <div className="relative z-10 -mt-12 space-y-6 sm:-mt-16">
        <div className="space-y-3 px-4 sm:px-8 lg:px-12">
          {meta && (
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="font-display text-2xl font-bold sm:text-3xl">{meta.label}</h2>
              <p className="text-sm text-muted-foreground">{meta.tagline}</p>
            </div>
          )}
          <GenreChips value={genres} onChange={setGenres} />
        </div>
        {shelves.length === 0 ? (
          <div className="px-4 py-16 text-center text-muted-foreground sm:px-8 lg:px-12">
            Nothing here matches those genres yet — try another mix.
          </div>
        ) : (
          shelves.map((shelf, i) => (
            <Fragment key={shelf.id}>
              <Shelf title={shelf.title} items={shelf.items} />
              {i === 0 && <PromoBanner />}
              {i === 1 && (
                <div className="hidden justify-center px-4 md:flex">
                  <AdSlot slot="leaderboard" />
                </div>
              )}
            </Fragment>
          ))
        )}
        <p className="px-4 text-[11px] text-muted-foreground/60 sm:px-8 lg:px-12">Metadata: {data.provider}</p>
      </div>
    </div>
  );
}
