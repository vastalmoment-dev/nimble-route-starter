import { Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloads, useDownloads } from "@/lib/download/store";
import { useT } from "@/lib/i18n";
import { canStreamSource, type AudioOption } from "@/lib/stream/resolver";
import type { MediaItem } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

export function DownloadButton({
  item,
  episode = 1,
  season,
  audio = "sub",
  includeSubtitles = false,
  variant = "glass",
  compact = false,
  className,
}: {
  item: Pick<
    MediaItem,
    | "source"
    | "id"
    | "title"
    | "malId"
    | "imdbId"
    | "tmdbId"
    | "mediaType"
    | "englishTitle"
    | "romajiTitle"
  >;
  episode?: number;
  season?: number | undefined;
  audio?: AudioOption | undefined;
  includeSubtitles?: boolean | undefined;
  variant?: "glass" | "icon";
  compact?: boolean;
  className?: string;
}) {
  const { lang, t } = useT();
  const jobs = useDownloads();
  const trackAudio: AudioOption = audio ?? "sub";
  const includeSubs = Boolean(includeSubtitles);
  const seasonNum = season ?? 1;
  const jobId = `${item.source}:${item.id}:${seasonNum}:${episode}:${trackAudio}:${lang}:${includeSubs ? "subs" : "nosubs"}`;
  const job = jobs.find((j) => j.id === jobId);
  const busy = job?.status === "resolving" || job?.status === "downloading";
  const done = job?.status === "done";
  const isAnime = item.source === "anilist";
  const isMovie = item.mediaType === "movie";

  const label = busy
    ? `${Math.round((job?.progress ?? 0) * 100)}%`
    : done
      ? t("common.saved")
      : isAnime
        ? `${t("common.download")} ${trackAudio.toUpperCase()}${includeSubs ? ` ${t("watch.plusSubs")}` : ` (${t("watch.noSubs")})`}`
        : isMovie
          ? t("common.downloadMovie")
          : t("common.download");
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
          season: seasonNum,
          mediaType: item.mediaType,
          title: item.title,
          audio: trackAudio,
          includeSubtitles: includeSubs,
          malId: item.malId,
          imdbId: item.imdbId,
          tmdbId: item.tmdbId,
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
