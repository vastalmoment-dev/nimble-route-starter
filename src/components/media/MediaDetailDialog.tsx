import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Clock, ExternalLink, Play, Star, Users } from "lucide-react";
import { useState } from "react";
import { AdSlot } from "@/components/ads/AdSlot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { detailQuery } from "@/lib/catalog";
import { SECTION_META, type MediaItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { DownloadButton } from "./DownloadButton";

export function MediaDetailDialog({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl gap-0 overflow-y-auto border-foreground/10 bg-popover p-0 sm:rounded-2xl">
        {item && <DetailBody item={item} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery(detailQuery(item.source, item.id));
  const [showAll, setShowAll] = useState(false);
  const d = data ?? item;
  const episodes = data?.episodes ?? [];
  const visible = showAll ? episodes : episodes.slice(0, 12);
  const meta = SECTION_META[item.section];
  const art = data?.backdrop ?? item.backdrop ?? item.posterHd ?? item.poster;

  return (
    <div>
      <div className="relative aspect-video max-h-[46vh] w-full overflow-hidden">
        {art && <img src={art} alt="" className="size-full object-cover object-[center_25%]" />}
        <div className="absolute inset-0 bg-hero-bottom" />
        <div className="absolute inset-x-0 bottom-0 space-y-4 p-6 sm:p-8">
          <span className={cn("text-xs font-bold uppercase tracking-[0.3em]", meta.colorClass)}>{meta.label}</span>
          <DialogTitle className="font-display text-3xl font-bold leading-tight sm:text-4xl">{d.title}</DialogTitle>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="hero" size="xl">
              <Link to="/watch/$source/$id" params={{ source: item.source, id: item.id }} search={{ ep: 1 }} onClick={onClose}>
                <Play /> Watch Now
              </Link>
            </Button>
            <DownloadButton item={item} />
          </div>
        </div>
      </div>

      <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {d.rating ? (
              <span className="inline-flex items-center gap-1 font-semibold text-gold">
                <Star className="size-4 fill-current" /> {d.rating.toFixed(1)}
              </span>
            ) : null}
            {d.year && <span>{d.year}</span>}
            {d.runtime ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> {d.runtime} min
              </span>
            ) : null}
            {d.network && <span>{d.network}</span>}
            {d.status && <span className="capitalize">{d.status}</span>}
          </div>
          <DialogDescription className="text-base leading-relaxed text-foreground/85">
            {d.description || "No synopsis available yet."}
          </DialogDescription>
          <div className="flex flex-wrap gap-2">
            {d.genres.map((g) => (
              <span key={g} className="rounded-full border border-foreground/10 bg-surface px-3 py-1 text-xs">
                {g}
              </span>
            ))}
          </div>

          {(data?.watchLinks?.length ?? 0) > 0 && (
            <div>
              <h3 className="mb-3 font-display text-sm font-semibold">Watch the full series officially</h3>
              <div className="flex flex-wrap gap-2">
                {data!.watchLinks!.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-cerulean/40 bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-cerulean hover:text-cerulean"
                  >
                    {l.site} <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {(data?.cast.length ?? 0) > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold">
                <Users className="size-4 text-cerulean" /> Cast
              </h3>
              <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1">
                {data!.cast.map((c) => (
                  <div key={`${c.name}-${c.role}`} className="w-20 shrink-0 text-center">
                    <div className="mx-auto size-16 overflow-hidden rounded-full bg-surface ring-1 ring-foreground/10">
                      {c.image && <img src={c.image} alt="" loading="lazy" className="size-full object-cover" />}
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-medium">{c.name}</p>
                    {c.role && <p className="line-clamp-1 text-[11px] capitalize text-muted-foreground">{c.role}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-3 font-display text-sm font-semibold">
              Episodes {episodes.length ? <span className="text-muted-foreground">· {episodes.length}</span> : null}
            </h3>
            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-16 rounded-lg skeleton-shimmer" />
                ))}
              </div>
            )}
            {isError && <p className="text-sm text-muted-foreground">Episode list is unavailable right now.</p>}
            <ol className="space-y-1.5">
              {visible.map((ep) => (
                <li key={ep.id} className="group/ep flex items-center gap-3 rounded-lg p-2 transition hover:bg-surface">
                  <span className="w-6 shrink-0 text-center font-display text-sm text-muted-foreground">{ep.number}</span>
                  <Link
                    to="/watch/$source/$id"
                    params={{ source: item.source, id: item.id }}
                    search={{ ep: ep.number }}
                    onClick={onClose}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-surface">
                      {ep.thumbnail && <img src={ep.thumbnail} alt="" loading="lazy" className="size-full object-cover" />}
                      <span className="absolute inset-0 flex items-center justify-center bg-scrim/50 opacity-0 transition group-hover/ep:opacity-100">
                        <Play className="size-4 fill-current" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{ep.title}</p>
                      {ep.runtime ? <p className="text-xs text-muted-foreground">{ep.runtime} min</p> : null}
                    </div>
                  </Link>
                  <DownloadButton item={item} episode={ep.number} variant="icon" compact />
                </li>
              ))}
            </ol>
            {episodes.length > 12 && (
              <Button variant="ghost" className="mt-2 w-full" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "Show fewer" : `Show all ${episodes.length} episodes`}
              </Button>
            )}
          </div>
        </div>
        <div className="hidden md:block">
          <div className="sticky top-6 space-y-4">
            {item.poster && <img src={item.posterHd ?? item.poster} alt="" className="w-full rounded-xl shadow-card" />}
            <AdSlot slot="rectangle" />
          </div>
        </div>
      </div>
    </div>
  );
}
