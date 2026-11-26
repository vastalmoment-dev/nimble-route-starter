import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, SearchX } from "lucide-react";
import { useMemo } from "react";
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
import { dedupe } from "@/lib/catalog/shelves";
import { useSiteLanguage } from "@/lib/i18n/language";

interface SearchParams {
  q?: string | undefined;
  genres?: string | undefined;
}

function parseSearchParams(raw: Record<string, unknown>): SearchParams {
  const qRaw = raw?.["q"];
  const genresRaw = raw?.["genres"];
  const q =
    typeof qRaw === "string"
      ? qRaw
      : typeof qRaw === "number" || typeof qRaw === "boolean"
        ? String(qRaw)
        : undefined;
  const genres = typeof genresRaw === "string" ? genresRaw : undefined;
  return {
    ...(q !== undefined ? { q } : {}),
    ...(genres !== undefined ? { genres } : {}),
  };
}

export const Route = createFileRoute("/search")({
  validateSearch: parseSearchParams,
  head: () => ({
    meta: [
      { title: "Search — SHADOW" },
      {
        name: "description",
        content:
          "Search anime, K-dramas, Hollywood, Bollywood/Tollywood and cartoons in real time.",
      },
      { property: "og:title", content: "Search — SHADOW" },
      { property: "og:description", content: "Find your next watch across every SHADOW genre." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex, follow" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const search = Route.useSearch();
  const q = typeof search.q === "string" ? search.q : search.q != null ? String(search.q) : "";
  const rawGenres = typeof search.genres === "string" ? search.genres : "";
  const navigate = useNavigate({ from: "/search" });
  const lang = useSiteLanguage();
  const genres = useMemo(
    () => rawGenres.split(",").filter(isGenreChipId) as GenreChipId[],
    [rawGenres],
  );
  const term = q.trim();

  const home = useQuery(sectionQuery("home", lang));
  const remote = useQuery(searchQuery(term));

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
    const merged = dedupe([...(lower ? remoteItems : []), ...local]);
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
                Results for <span className="text-brand-gradient">“{term}”</span>
              </>
            ) : (
              "Browse everything"
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
            <Loader2 className="size-3.5 animate-spin" /> Searching full catalog…
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
          <p>No titles match that yet. Try a different spelling or genre.</p>
        </div>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {children}
    </div>
  );
}
