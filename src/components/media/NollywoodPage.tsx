import { useRouter } from "@tanstack/react-router";
import { Film, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { TrailerFrame } from "@/components/player/TrailerFrame";
import { Button } from "@/components/ui/button";
import { ResilientImage } from "./ResilientImage";
import { WatchPromoGate } from "@/components/ads/WatchPromoGate";
import { NOLLYWOOD_ADDITIONS } from "@/lib/catalog/nollywood-additions";
import { NOLLYWOOD_MOVIES } from "@/lib/catalog/nollywood";
import { NOLLYWOOD_ARCHIVE } from "@/lib/catalog/nollywood-archive";

type Movie = { youtubeId: string; title: string; genre?: string; format: string; channel: string; image: string; synopsis?: string; cast?: string };

export function NollywoodPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const router = useRouter();
  const registerStop = useCallback((stop: () => void) => {
    stopRef.current = stop;
    return () => { if (stopRef.current === stop) stopRef.current = null; };
  }, []);
  useEffect(() => router.subscribe("onBeforeNavigate", () => {
    stopRef.current?.();
    setActiveId(null);
  }), [router]);
  const selectMovie = (id: string | null) => {
    stopRef.current?.();
    setActiveId(id);
  };

  const [filter, setFilter] = useState<"all" | "new" | "picks" | "archive">("all");
  const latest: Movie[] = NOLLYWOOD_ADDITIONS;
  const groups = { new: latest, picks: [...NOLLYWOOD_MOVIES] as Movie[], archive: NOLLYWOOD_ARCHIVE as Movie[] };
  const movies: Movie[] = filter === "all" ? [...groups.new, ...groups.picks, ...groups.archive] : groups[filter];
  const tabs = [["all", "All movies"], ["new", "Newly added"], ["picks", "Our picks"], ["archive", "From the archive"]] as const;

  return (
    <div className="px-4 pt-24 sm:px-8 lg:px-12">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cerulean"><Film className="size-4" /> Nigerian cinema</p>
        <h1 className="font-display text-3xl font-bold !tracking-normal sm:text-4xl">Nollywood</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Big feelings. Unforgettable stories. Romance, comedy and drama from Nigeria's storytellers.</p>
        <p className="mt-4 text-xs text-muted-foreground">Full-length uploads from official Nollywood channels</p>
      </header>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Filter Nollywood movies">
        {tabs.map(([key, label]) => (
          <Button key={key} role="tab" aria-selected={filter === key} size="sm" variant={filter === key ? "default" : "secondary"} className="rounded-full" onClick={() => { selectMovie(null); setFilter(key); }}>
            {label} <span className="text-xs opacity-70">{key === "all" ? groups.new.length + groups.picks.length + groups.archive.length : groups[key].length}</span>
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2 2xl:grid-cols-3">
        {movies.map((movie) => {
          const active = activeId === movie.youtubeId;
          return (
            <article key={movie.youtubeId} className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
              <div className="relative aspect-video overflow-hidden bg-scrim">
                {active ? (
                  <WatchPromoGate key={movie.youtubeId}><TrailerFrame youtubeId={movie.youtubeId} title={movie.title} playbackLabel="movie" registerStop={registerStop} /></WatchPromoGate>
                ) : (
                  <>
                    <ResilientImage src={movie.image} alternatives={[`https://i.ytimg.com/vi/${movie.youtubeId}/mqdefault.jpg`]} fallbackLabel={movie.title} alt={`${movie.title} — official movie thumbnail`} loading="lazy" className="size-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-card-scrim pointer-events-none" />
                    <Button variant="icon" size="xl" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-4" aria-label={`Watch ${movie.title}`} onClick={() => selectMovie(movie.youtubeId)}><Play className="fill-current" /></Button>
                    <span className="absolute bottom-3 left-3 rounded bg-scrim/85 px-2 py-1 text-xs font-semibold">{movie.format}</span>
                  </>
                )}
              </div>
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium text-cerulean">{movie.genre}</p>
                    <h2 className="text-xl font-bold leading-snug">{movie.title}</h2>
                  </div>
                  {active && <Button variant="ghost" size="icon" aria-label={`Stop ${movie.title}`} title="Stop movie" onClick={() => selectMovie(null)}><X /></Button>}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{movie.synopsis}</p>
                {movie.cast && <p className="text-xs leading-relaxed text-muted-foreground">{movie.cast}</p>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">{movie.channel}</span>
                  {!active && <Button variant="secondary" size="sm" onClick={() => selectMovie(movie.youtubeId)}><Play /> {movie.format.startsWith("Part") ? `Watch ${movie.format.toLowerCase()}` : "Watch movie"}</Button>}
                  {active && <span className="text-xs text-cerulean">Now watching</span>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">Official YouTube uploads · Availability depends on the publisher and your region.</p>
    </div>
  );
}