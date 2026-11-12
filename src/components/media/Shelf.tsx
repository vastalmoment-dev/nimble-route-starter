import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import type { MediaItem } from "@/lib/catalog/types";
import { MediaCard, MediaCardSkeleton } from "./MediaCard";

const CARD = "w-[140px] sm:w-[160px] lg:w-[180px] snap-start";

export function Shelf({ title, items }: { title: string; items: MediaItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };
  return (
    <section className="group/shelf relative animate-fade-up">
      <div className="mb-3 flex items-end justify-between px-4 sm:px-8 lg:px-12">
        <h2 className="font-display text-base font-semibold sm:text-lg">{title}</h2>
        <div className="hidden gap-1.5 opacity-0 transition-opacity group-hover/shelf:opacity-100 sm:flex">
          <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)} className="rounded-full border bg-surface p-1.5 hover:bg-accent">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" aria-label="Scroll right" onClick={() => scroll(1)} className="rounded-full border bg-surface p-1.5 hover:bg-accent">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-6 pt-2 sm:scroll-px-8 sm:px-8 lg:scroll-px-12 lg:px-12"
      >
        {items.map((item) => (
          <MediaCard key={item.key} item={item} className={CARD} />
        ))}
      </div>
    </section>
  );
}

export function ShelfSkeleton() {
  return (
    <div className="px-4 sm:px-8 lg:px-12">
      <div className="mb-3 h-5 w-48 rounded skeleton-shimmer" />
      <div className="flex gap-3 overflow-hidden pb-6 pt-2">
        {Array.from({ length: 8 }, (_, i) => (
          <MediaCardSkeleton key={i} className={CARD} />
        ))}
      </div>
    </div>
  );
}
