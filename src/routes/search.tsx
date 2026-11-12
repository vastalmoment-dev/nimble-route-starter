import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, SearchX } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { GenreChips } from "@/components/media/GenreChips";
import { MediaCard, MediaCardSkeleton } from "@/components/media/MediaCard";
import { filterByGenres, isGenreChipId, searchQuery, sectionQuery, type GenreChipId } from "@/lib/catalog";
import { dedupe } from "@/lib/catalog/shelves";

const searchSchema = z.object({
  q: z.string().optional().catch(undefined),
  genres: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Search — SHADOW" },
      { name: "description", content: "Search anime, K-dramas, Hollywood, Bollywood/Tollywood and cartoons in real time." },
      { property: "og:title", content: "Search — SHADOW" },
      { property: "og:description", content: "Find your next watch across every SHADOW genre." },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, follow" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q = "", genres: rawGenres } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const genres = useMemo(() => (rawGenres ?? "").split(",").filter(isGenreChipId) as GenreChipId[], [rawGenres]);
  const term = q.trim();

  const home = useQuery(sectionQuery("home"));
  const remote = useQuery(searchQuery(term));

  const results = useMemo(() => {
    const lower = term.toLowerCase();
    const local = lower
      ? (home.data?.items ?? []).filter((i) => i.title.toLowerCase().includes(lower))
      : (home.data?.items ?? []);
    const merged = dedupe([...local, ...(lower ? (remote.data ?? []) : [])]);
    return filterByGenres(merged, genres).filter((i) => i.poster);
  }, [term, home.data, remote.data, genres]);

  const loading = (home.isLoading || (term.length >= 2 && remote.isLoading)) && results.length === 0;

  return (
    <div className="min-h-screen px-4 pb-10 pt-24 sm:px-8 lg:px-12">
      <div className="mb-6 space-y-4">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          {term ? (
            <>
              Results for <span className="text-brand-gradient">“{term}”</span>
            </>
          ) : (
            "Browse everything"
          )}
        </h1>
        <GenreChips
          value={genres}
          onChange={(next) => void navigate({ search: (prev) => ({ ...prev, genres: next.length ? next.join(",") : undefined }), replace: true })}
        />
        {term.length >= 2 && remote.isFetching && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Searching AniList and TVmaze…
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
  return <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">{children}</div>;
}
