import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/lib/catalog/types";
import { useT } from "@/lib/i18n";
import { useIsInWatchlist, watchlist } from "@/lib/watchlist/store";
import { cn } from "@/lib/utils";

export function WatchlistButton({
  item,
  compact = false,
  className,
}: {
  item: MediaItem;
  compact?: boolean;
  className?: string;
}) {
  const { lang, t } = useT();
  const saved = useIsInWatchlist(item.key);
  const label = saved ? t("watchlist.inWatchlist") : t("watchlist.add");

  return (
    <Button
      type="button"
      variant="glass"
      size={compact ? "round" : "xl"}
      aria-label={
        saved
          ? lang === "fr"
            ? `Retirer ${item.title} de ma liste`
            : `Remove ${item.title} from watchlist`
          : lang === "fr"
            ? `Ajouter ${item.title} à ma liste`
            : `Save ${item.title} to watchlist`
      }
      aria-pressed={saved}
      title={
        saved
          ? lang === "fr"
            ? "Enregistré dans Ma Liste (cliquer pour retirer)"
            : "Saved in My Watchlist (click to remove)"
          : lang === "fr"
            ? "Enregistrer dans Ma Liste"
            : "Save to My Watchlist"
      }
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        watchlist.toggle(item);
      }}
      className={cn(
        compact && "size-9",
        saved && "border-cerulean/60 bg-cerulean/20 text-foreground",
        className,
      )}
    >
      {saved ? <BookmarkCheck className="text-cerulean" /> : <Bookmark />}
      {!compact && <span>{label}</span>}
    </Button>
  );
}
