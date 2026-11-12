import { Link } from "@tanstack/react-router";
import { Play, Star } from "lucide-react";
import type { MediaItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { useMediaModal } from "./MediaModalContext";

const SECTION_DOT: Record<MediaItem["section"], string> = {
  anime: "bg-genre-anime",
  "k-dramas": "bg-genre-kdrama",
  hollywood: "bg-genre-hollywood",
  bollywood: "bg-genre-bollywood",
  cartoons: "bg-genre-cartoons",
};

export function MediaCard({ item, className }: { item: MediaItem; className?: string }) {
  const { open } = useMediaModal();
  return (
    <div className={cn("group/card relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => open(item)}
        className="relative block aspect-[2/3] w-full overflow-hidden rounded-lg bg-surface text-left shadow-card ring-1 ring-foreground/5 transition duration-300 ease-out group-hover/card:-translate-y-1 group-hover/card:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${item.title} — more info`}
      >
        {item.poster ? (
          <img
            src={item.poster}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition duration-500 group-hover/card:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center p-3 text-center font-display text-sm text-muted-foreground">
            {item.title}
          </div>
        )}
        <span className="absolute inset-0 bg-card-scrim opacity-0 transition-opacity duration-300 group-hover/card:opacity-100" />
        <span className="absolute inset-x-0 bottom-0 translate-y-2 p-3 opacity-0 transition duration-300 group-hover/card:translate-y-0 group-hover/card:opacity-100">
          <span className="line-clamp-2 text-sm font-bold leading-tight">{item.title}</span>
          <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            {item.year && <span>{item.year}</span>}
            {item.rating ? (
              <span className="inline-flex items-center gap-0.5 text-gold">
                <Star className="size-3 fill-current" /> {item.rating.toFixed(1)}
              </span>
            ) : null}
            {item.genres[0] && <span className="truncate">{item.genres[0]}</span>}
          </span>
        </span>
        <span className={cn("absolute left-2 top-2 size-1.5 rounded-full", SECTION_DOT[item.section])} />
      </button>
      <Link
        to="/watch/$source/$id"
        params={{ source: item.source, id: item.id }}
        search={{ ep: 1 }}
        aria-label={`Play ${item.title}`}
        className="absolute right-2 top-2 flex size-9 scale-75 items-center justify-center rounded-full bg-foreground text-background opacity-0 shadow-card transition duration-300 group-hover/card:scale-100 group-hover/card:opacity-100 focus-visible:opacity-100"
      >
        <Play className="size-4 translate-x-px fill-current" />
      </Link>
    </div>
  );
}

export function MediaCardSkeleton({ className }: { className?: string }) {
  return <div className={cn("aspect-[2/3] shrink-0 rounded-lg skeleton-shimmer", className)} />;
}
