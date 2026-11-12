import { GENRE_CHIPS, type GenreChipId } from "@/lib/catalog/genres";
import { cn } from "@/lib/utils";

export function GenreChips({
  value,
  onChange,
  className,
}: {
  value: GenreChipId[];
  onChange: (next: GenreChipId[]) => void;
  className?: string;
}) {
  const chip = (active: boolean) =>
    cn(
      "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition",
      active
        ? "border-transparent bg-brand-gradient text-foreground shadow-glow"
        : "border-foreground/10 bg-surface/70 text-muted-foreground backdrop-blur hover:border-foreground/25 hover:text-foreground",
    );
  return (
    <div role="toolbar" aria-label="Filter by genre" className={cn("no-scrollbar flex gap-2 overflow-x-auto", className)}>
      <button type="button" aria-pressed={value.length === 0} className={chip(value.length === 0)} onClick={() => onChange([])}>
        All
      </button>
      {GENRE_CHIPS.map((g) => {
        const active = value.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={active}
            className={chip(active)}
            onClick={() => onChange(active ? value.filter((v) => v !== g.id) : [...value, g.id])}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}
