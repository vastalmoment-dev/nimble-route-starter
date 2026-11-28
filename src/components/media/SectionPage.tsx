import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCw, Settings, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { AdSlot } from "@/components/ads/AdSlot";
import { PromoBanner } from "@/components/ads/PromoBanner";
import { Button } from "@/components/ui/button";
import { filterByGenres, sectionQuery, type GenreChipId } from "@/lib/catalog";
import { SECTION_META, type SectionId } from "@/lib/catalog/types";
import { getSectionMeta, useT } from "@/lib/i18n";
import { playbackProgress, useContinueWatching } from "@/lib/player/progress";
import { useWatchlist } from "@/lib/watchlist/store";
import { GenreChips } from "./GenreChips";
import { HeroCarousel, HeroSkeleton } from "./HeroCarousel";
import { LanguageToggle } from "./LanguageToggle";
import { Shelf, ShelfSkeleton } from "./Shelf";

export function SectionPage({
  section,
  renderAfterShelves,
}: {
  section: SectionId | "home";
  renderAfterShelves?: ((genres: GenreChipId[]) => ReactNode) | undefined;
}) {
  const { lang, t } = useT();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    ...sectionQuery(section, lang),
    staleTime: 1000 * 60 * 2,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 1000 * 60 * 3,
    refetchIntervalInBackground: false,
  });
  const [genres, setGenres] = useState<GenreChipId[]>([]);
  const watchlistEntries = useWatchlist();
  const continueEntries = useContinueWatching();

  const continueItems = useMemo(
    () =>
      filterByGenres(
        continueEntries
          .filter((e) => section === "home" || e.item.section === section)
          .map((e) => e.item),
        genres,
      ),
    [section, continueEntries, genres],
  );

  const watchlistItems = useMemo(
    () =>
      section === "home"
        ? filterByGenres(
            watchlistEntries.map((e) => e.item),
            genres,
          )
        : [],
    [section, watchlistEntries, genres],
  );

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
        <h1 className="font-display text-2xl font-bold">{t("section.shelfErrorTitle")}</h1>
        <p className="max-w-sm text-muted-foreground">{t("section.shelfErrorDesc")}</p>
        <Button variant="brand" size="xl" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> {t("common.tryAgain")}
        </Button>
      </div>
    );
  }

  const meta = section === "home" ? null : SECTION_META[section];
  const localizedMeta = section === "home" ? null : getSectionMeta(section, lang);

  return (
    <div>
      <HeroCarousel items={data.featured} />
      <div className="relative z-10 -mt-12 space-y-6 sm:-mt-16">
        <div className="space-y-3 px-4 sm:px-8 lg:px-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {meta ? (
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="font-display text-2xl font-bold sm:text-3xl">
                  {localizedMeta?.label ?? meta.label}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {localizedMeta?.tagline ?? meta.tagline}
                </p>
              </div>
            ) : (
              <div />
            )}
            <LanguageToggle compact />
          </div>
          <GenreChips value={genres} onChange={setGenres} />
        </div>
        {continueItems.length > 0 && (
          <Shelf
            testId="continue-watching-shelf"
            title={t("section.continueWatching")}
            items={continueItems}
            onRemoveItem={(item) => playbackProgress.removeShowHistory(item.source, item.id)}
            rightAction={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    playbackProgress.clearHistory(
                      section === "home" ? "all" : section === "anime" ? "anime" : "other",
                    )
                  }
                  className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-foreground/15 bg-surface/80 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-destructive/50 hover:text-destructive sm:min-h-0"
                >
                  <Trash2 className="size-3.5" />
                  <span>{t("continue.clearHistory")}</span>
                </button>
                <Link
                  to="/settings"
                  className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-foreground/15 bg-surface/80 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-cerulean/50 hover:text-foreground sm:min-h-0"
                >
                  <Settings className="size-3.5" />
                  <span>{t("continue.manageSettings")}</span>
                </Link>
              </div>
            }
          />
        )}
        {watchlistItems.length > 0 && <Shelf title={t("watchlist.title")} items={watchlistItems} />}
        {shelves.length === 0 ? (
          <div className="px-4 py-16 text-center text-muted-foreground sm:px-8 lg:px-12">
            {t("section.emptyGenres")}
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
        {renderAfterShelves?.(genres)}
      </div>
    </div>
  );
}
