import { Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloads, useDownloads } from "@/lib/download/store";
import { canStreamSource, type AudioOption } from "@/lib/stream/resolver";
import type { MediaItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

export function DownloadButton({
  item,
  episode = 1,
  audio = "sub",
  variant = "glass",
  compact = false,
  className,
}: {
  item: Pick<MediaItem, "source" | "id" | "title" | "malId" | "englishTitle" | "romajiTitle">;
  episode?: number;
  audio?: AudioOption | undefined;
  variant?: "glass" | "icon";
  compact?: boolean;
  className?: string;
}) {
  const jobs = useDownloads();
  const trackAudio: AudioOption = audio ?? "sub";
  const job = jobs.find((j) => j.id === `${item.source}:${item.id}:${episode}:${trackAudio}`);
  const busy = job?.status === "resolving" || job?.status === "downloading";
  const done = job?.status === "done";
  const label = busy
    ? `${Math.round((job?.progress ?? 0) * 100)}%`
    : done
      ? "Saved"
      : item.source === "anilist"
        ? `Download ${trackAudio.toUpperCase()}`
        : "Download";
  if (!canStreamSource(item.source)) return null;

  return (
    <Button
      type="button"
      variant={variant}
      size={compact ? "round" : "xl"}
      className={cn(compact && "size-9", className)}
      aria-label={compact ? `${label} episode ${episode}` : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (busy) return;
        void downloads.start({
          source: item.source,
          id: item.id,
          episode,
          title: item.title,
          audio: trackAudio,
          malId: item.malId,
          englishTitle: item.englishTitle,
          romajiTitle: item.romajiTitle,
        });
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : done ? <Check /> : <Download />}
      {!compact && <span>{label}</span>}
    </Button>
  );
}
