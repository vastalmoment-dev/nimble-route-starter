import { GENRE_CHIPS, type GenreChipId } from "@/lib/catalog/genres";
import { translateGenreChip, useT } from "@/lib/i18n";
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
  const { lang, t } = useT();
  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 py-2 text-sm font-medium transition sm:min-h-0 sm:py-1.5",
      active
        ? "border-transparent bg-brand-gradient text-foreground shadow-glow"
        : "border-foreground/10 bg-surface/70 text-muted-foreground backdrop-blur hover:border-foreground/25 hover:text-foreground",
    );
  return (
    <div
      role="toolbar"
      aria-label={t("genre.filterAria")}
      className={cn(
        "no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0",
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={value.length === 0}
        className={chip(value.length === 0)}
        onClick={() => onChange([])}
      >
        {t("common.all")}
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
            {translateGenreChip(g.id, lang)}
          </button>
        );
      })}
    </div>
  );
}
