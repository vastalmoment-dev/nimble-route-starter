import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/lib/catalog/types";
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
  const saved = useIsInWatchlist(item.key);
  const label = saved ? "In Watchlist" : "My Watchlist";

  return (
    <Button
      type="button"
      variant="glass"
      size={compact ? "round" : "xl"}
      aria-label={saved ? `Remove ${item.title} from watchlist` : `Save ${item.title} to watchlist`}
      aria-pressed={saved}
      title={saved ? "Saved in My Watchlist (click to remove)" : "Save to My Watchlist"}
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
