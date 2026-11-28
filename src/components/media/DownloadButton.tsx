import { Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAnimeItem } from "@/lib/catalog/anime-bridge";
import type { MediaItem } from "@/lib/catalog/types";
import { offlineLibrary, useOfflineLibrary } from "@/lib/download/offline-db";
import { downloads, useDownloads } from "@/lib/download/store";
import { useT } from "@/lib/i18n";
import { canStreamSource, type AudioOption } from "@/lib/stream/resolver";
import { cn } from "@/lib/utils";

export function DownloadButton({
  item,
  episode = 1,
  season,
  audio = "sub",
  includeSubtitles = false,
  anilistId,
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
  > &
    Partial<Pick<MediaItem, "section" | "genres" | "language" | "poster">>;
  episode?: number;
  season?: number | undefined;
  audio?: AudioOption | undefined;
  includeSubtitles?: boolean | undefined;
  anilistId?: string | null | undefined;
  variant?: "glass" | "icon";
  compact?: boolean;
  className?: string;
}) {
  const { lang, t } = useT();
  const jobs = useDownloads();
  const offlineEntries = useOfflineLibrary();
  const trackAudio: AudioOption = audio ?? "sub";
  const includeSubs = Boolean(includeSubtitles);
  const seasonNum = season ?? 1;
  const jobId = `${item.source}:${item.id}:${seasonNum}:${episode}:${trackAudio}:${lang}:${includeSubs ? "subs" : "nosubs"}`;
  const offlineEntryId = offlineLibrary.buildId({
    source: item.source,
    id: item.id,
    season: seasonNum,
    episode,
    audio: trackAudio,
    lang,
  });
  const job = jobs.find((j) => j.id === jobId);
  const busy =
    job?.status === "queued" || job?.status === "resolving" || job?.status === "downloading";
  const savedOffline = offlineEntries.some((entry) => entry.id === offlineEntryId);
  const done = job?.status === "done" || savedOffline;
  const isAnime = Boolean(isAnimeItem(item) || anilistId);
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
      aria-label={
        compact ? (isMovie ? `${label} — ${item.title}` : `${label} episode ${episode}`) : undefined
      }
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
          poster: item.poster ?? null,
          audio: trackAudio,
          includeSubtitles: includeSubs,
          lang,
          isAnime,
          anilistId: anilistId ?? undefined,
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
