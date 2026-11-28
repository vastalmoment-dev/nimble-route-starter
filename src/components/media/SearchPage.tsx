import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, SearchX } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { GenreChips } from "@/components/media/GenreChips";
import { LanguageToggle } from "@/components/media/LanguageToggle";
import { MediaCard, MediaCardSkeleton } from "@/components/media/MediaCard";
import {
  filterByGenres,
  isGenreChipId,
  searchQuery,
  sectionQuery,
  type GenreChipId,
} from "@/lib/catalog";
import { dedupeSearchAnimePriority } from "@/lib/catalog/anime-bridge";
import { useT } from "@/lib/i18n";

export interface SearchPageProps {
  q?: string | undefined;
  genres?: string | undefined;
}

export function SearchPage({ q: rawQ, genres: rawGenresProp }: SearchPageProps) {
  const q = typeof rawQ === "string" ? rawQ : rawQ != null ? String(rawQ) : "";
  const rawGenres = typeof rawGenresProp === "string" ? rawGenresProp : "";
  const navigate = useNavigate({ from: "/search" });
  const { lang, t } = useT();
  const genres = useMemo(
    () => rawGenres.split(",").filter(isGenreChipId) as GenreChipId[],
    [rawGenres],
  );
  const term = q.trim();

  const home = useQuery(sectionQuery("home", lang));
  const remote = useQuery(searchQuery(term, lang));

  const results = useMemo(() => {
    const homeItems = Array.isArray(home.data?.items) ? home.data.items : [];
    const remoteItems = Array.isArray(remote.data) ? remote.data : [];
    const lower = term.toLowerCase();
    const local = lower
      ? homeItems.filter(
          (i) =>
            (i.title ?? "").toLowerCase().includes(lower) ||
            i.englishTitle?.toLowerCase().includes(lower) ||
            i.romajiTitle?.toLowerCase().includes(lower) ||
            (i.genres ?? []).some((g) => g.toLowerCase().includes(lower)),
        )
      : homeItems;
    const merged = dedupeSearchAnimePriority([...(lower ? remoteItems : []), ...local]);
    const filtered = filterByGenres(merged, genres);
    return lower ? filtered : filtered.slice(0, 120);
  }, [term, home.data, remote.data, genres]);

  const loading =
    (home.isLoading || (term.length >= 2 && remote.isLoading)) && results.length === 0;

  return (
    <div className="min-h-screen px-4 pb-10 pt-24 sm:px-8 lg:px-12">
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {term ? (
              <>
                {t("search.resultsFor")} <span className="text-brand-gradient">“{term}”</span>
              </>
            ) : (
              t("search.browseAll")
            )}
          </h1>
          <LanguageToggle compact />
        </div>
        <GenreChips
          value={genres}
          onChange={(next) =>
            void navigate({
              search: (prev) => ({
                ...(prev.q !== undefined ? { q: prev.q } : {}),
                ...(next.length ? { genres: next.join(",") } : {}),
              }),
              replace: true,
            })
          }
        />
        {term.length >= 2 && remote.isFetching && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {t("search.searchingFull")}
          </p>
        )}
      </div>
      {loading ? (
        <Grid>
          {Array.from({ length: 12 }, (_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </Grid>
      ) : results.length ? (
        <Grid>
          {results.map((item) => (
            <MediaCard key={item.key} item={item} />
          ))}
        </Grid>
      ) : (
        <div className="flex flex-col items-center gap-3 py-24 text-center text-muted-foreground">
          <SearchX className="size-10" />
          <p>{t("search.empty")}</p>
        </div>
      )}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {children}
    </div>
  );
}
