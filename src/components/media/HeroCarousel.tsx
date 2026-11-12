import { Link } from "@tanstack/react-router";
import { Info, Play, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SECTION_META, type MediaItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { useMediaModal } from "./MediaModalContext";

export function HeroCarousel({ items }: { items: MediaItem[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const { open } = useMediaModal();

  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), 8000);
    return () => clearInterval(t);
  }, [paused, items.length]);

  if (!items.length) return <div className="h-28" />;

  return (
    <section
      className="relative h-[78vh] min-h-[520px] w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {items.map((item, i) => {
        const active = i === index;
        const meta = SECTION_META[item.section];
        return (
          <div
            key={item.key}
            aria-hidden={!active}
            className={cn("absolute inset-0 transition-opacity duration-1000", active ? "opacity-100" : "pointer-events-none opacity-0")}
          >
            <img
              src={item.backdrop ?? item.posterHd ?? item.poster ?? ""}
              alt=""
              className={cn(
                "absolute inset-0 size-full object-cover object-[center_25%] transition-transform duration-[9000ms] ease-out",
                active ? "scale-105" : "scale-100",
              )}
              {...(i === 0 ? { fetchPriority: "high" as const } : { loading: "lazy" as const })}
            />
            <div className="absolute inset-0 bg-hero-left" />
            <div className="absolute inset-0 bg-hero-bottom" />
            <div className="relative flex h-full max-w-3xl flex-col justify-end gap-4 px-4 pb-20 sm:px-8 sm:pb-24 lg:px-12">
              <span className={cn("text-xs font-bold uppercase tracking-[0.3em]", meta.colorClass)}>{meta.label}</span>
              <h1 className={cn("font-display text-4xl font-bold leading-[1.02] sm:text-6xl", active && "animate-fade-up")}>
                {item.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {item.rating ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-gold">
                    <Star className="size-4 fill-current" /> {item.rating.toFixed(1)}
                  </span>
                ) : null}
                {item.year && <span>{item.year}</span>}
                {item.genres.slice(0, 3).map((g) => (
                  <span key={g} className="rounded-full border border-foreground/15 bg-foreground/5 px-2.5 py-0.5 text-xs text-foreground/85">
                    {g}
                  </span>
                ))}
              </div>
              <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-foreground/80 sm:text-base">{item.description}</p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button asChild variant="hero" size="xl">
                  <Link to="/watch/$source/$id" params={{ source: item.source, id: item.id }} search={{ ep: 1 }}>
                    <Play /> Watch Now
                  </Link>
                </Button>
                <Button variant="glass" size="xl" onClick={() => open(item)}>
                  <Info /> More Info
                </Button>
              </div>
            </div>
          </div>
        );
      })}
      <div className="absolute bottom-8 right-4 flex gap-2 sm:right-8 lg:right-12">
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            aria-label={`Show ${item.title}`}
            onClick={() => setIndex(i)}
            className={cn("h-1 rounded-full transition-all", i === index ? "w-8 bg-brand-gradient" : "w-3 bg-foreground/30 hover:bg-foreground/60")}
          />
        ))}
      </div>
    </section>
  );
}

export function HeroSkeleton() {
  return (
    <div className="relative h-[78vh] min-h-[520px] w-full skeleton-shimmer">
      <div className="absolute inset-0 bg-hero-bottom" />
    </div>
  );
}
