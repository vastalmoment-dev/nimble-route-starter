import { Link } from "@tanstack/react-router";
import { Bookmark, BookmarkCheck, Play, Star } from "lucide-react";
import type { MediaItem } from "@/lib/catalog/types";
import { useT } from "@/lib/i18n";
import { preloadChunk } from "@/lib/preload-chunks";
import { useShowProgress } from "@/lib/player/progress";
import { useIsInWatchlist, watchlist } from "@/lib/watchlist/store";
import { cn } from "@/lib/utils";
import { DownloadButton } from "./DownloadButton";
import { MediaImage } from "./MediaImage";
import { useMediaModal } from "./MediaModalContext";

const SECTION_DOT: Record<MediaItem["section"], string> = {
  anime: "bg-genre-anime",
  "k-dramas": "bg-genre-kdrama",
  hollywood: "bg-genre-hollywood",
  bollywood: "bg-genre-bollywood",
  tollywood: "bg-genre-bollywood",
  nollywood: "bg-genre-bollywood",
  cartoons: "bg-genre-cartoons",
};

export function MediaCard({ item, className }: { item: MediaItem; className?: string }) {
  const { lang, t } = useT();
  const { open } = useMediaModal();
  const saved = useIsInWatchlist(item.key);
  const { last, progressPct } = useShowProgress(item.source, item.id);
  const titleFallback = (
    <div className="flex size-full items-center justify-center p-3 text-center font-display text-sm text-muted-foreground">
      {item.title}
    </div>
  );

  const resumeBadge = last
    ? item.mediaType === "movie"
      ? t("common.resume")
      : item.source !== "anilist" && last.season > 1
        ? `S${last.season}·E${last.episode}`
        : `${lang === "fr" ? "Ép." : "Ep"} ${last.episode}`
    : null;

  const playSearch = last
    ? item.source === "anilist"
      ? { ep: last.episode, ...(last.audio ? { audio: last.audio } : {}) }
      : item.mediaType === "movie"
        ? {}
        : { season: last.season, ep: last.episode }
    : {};

  return (
    <div className={cn("group/card relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => open(item)}
        className="relative block aspect-[2/3] w-full overflow-hidden rounded-lg bg-surface text-left shadow-card ring-1 ring-foreground/5 transition duration-300 ease-out group-hover/card:-translate-y-1 group-hover/card:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={lang === "fr" ? `${item.title} — plus d'infos` : `${item.title} — more info`}
      >
        <MediaImage
          src={item.poster ?? item.posterHd}
          fallbackSrc={item.posterHd ?? item.backdrop}
          source={item.source}
          itemId={item.id}
          imdbId={item.imdbId}
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition duration-500 group-hover/card:scale-105"
          fallback={titleFallback}
        />
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
            {resumeBadge ? (
              <span className="font-semibold text-cerulean">{resumeBadge}</span>
            ) : item.latestEpisode ? (
              <span className="text-cerulean">
                {lang === "fr" ? "Ép." : "Ep"} {item.latestEpisode}
              </span>
            ) : (
              item.genres?.[0] && <span className="truncate">{item.genres[0]}</span>
            )}
          </span>
        </span>
        <span
          className={cn("absolute left-2 top-2 size-1.5 rounded-full", SECTION_DOT[item.section])}
        />
        {resumeBadge ? (
          <span className="absolute bottom-2 left-2 rounded bg-scrim/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-cerulean backdrop-blur-sm transition-opacity group-hover/card:opacity-0">
            {resumeBadge}
          </span>
        ) : (
          item.latestEpisode && (
            <span className="absolute bottom-2 left-2 rounded bg-scrim/85 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-foreground backdrop-blur-sm transition-opacity group-hover/card:opacity-0">
              {lang === "fr" ? "ÉP" : "EP"} {item.latestEpisode}
            </span>
          )
        )}
        {last && (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-foreground/20">
            <span
              className="block h-full bg-brand-gradient"
              style={{ width: `${progressPct ?? 28}%` }}
            />
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          watchlist.toggle(item);
        }}
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
              ? "Enregistré dans Ma Liste"
              : "Saved in My Watchlist"
            : lang === "fr"
              ? "Enregistrer dans Ma Liste"
              : "Save to My Watchlist"
        }
        className={cn(
          "absolute right-12 top-2 flex size-9 items-center justify-center rounded-full border border-foreground/15 bg-scrim/80 text-foreground backdrop-blur-md transition duration-300 focus-visible:opacity-100",
          saved
            ? "border-cerulean/60 bg-cerulean/25 text-cerulean opacity-100"
            : "scale-75 opacity-0 group-hover/card:scale-100 group-hover/card:opacity-100",
        )}
      >
        {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
      </button>
      <Link
        to="/watch/$source/$id"
        params={{ source: item.source, id: item.id }}
        search={playSearch}
        onMouseEnter={() => preloadChunk("/watch")}
        onFocus={() => preloadChunk("/watch")}
        aria-label={
          last
            ? lang === "fr"
              ? `Reprendre ${item.title}`
              : `Resume ${item.title}`
            : lang === "fr"
              ? `Lire ${item.title}`
              : `Play ${item.title}`
        }
        className="absolute right-2 top-2 flex size-9 scale-75 items-center justify-center rounded-full bg-foreground text-background opacity-0 shadow-card transition duration-300 group-hover/card:scale-100 group-hover/card:opacity-100 focus-visible:opacity-100"
      >
        <Play className="size-4 translate-x-px fill-current" />
      </Link>
      {item.mediaType === "movie" && (
        <DownloadButton
          item={item}
          variant="icon"
          compact
          className="absolute left-2 top-2 scale-75 rounded-full border border-foreground/15 bg-scrim/80 text-foreground opacity-0 backdrop-blur-md transition duration-300 group-hover/card:scale-100 group-hover/card:opacity-100 focus-visible:opacity-100"
        />
      )}
    </div>
  );
}

export function MediaCardSkeleton({ className }: { className?: string }) {
  return <div className={cn("aspect-[2/3] shrink-0 rounded-lg skeleton-shimmer", className)} />;
}
