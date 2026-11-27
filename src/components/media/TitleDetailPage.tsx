import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ShowDetailBody } from "@/components/media/ShowDetailBody";
import { useWatchReturn } from "@/components/player/WatchNavigation";
import { Button } from "@/components/ui/button";
import { detailQuery } from "@/lib/catalog";
import { itemKey, type MediaItem, type Source } from "@/lib/catalog/types";
import { useT } from "@/lib/i18n";
import type { AudioOption } from "@/lib/stream/resolver";

function inferSectionFromId(src: Source, id: string): MediaItem["section"] {
  if (src === "anilist") return "anime";
  if (id.startsWith("movie-")) return "hollywood";
  return "hollywood";
}

function resolveBackLabel(pathname: string | undefined, t: ReturnType<typeof useT>["t"]): string {
  if (!pathname || pathname === "/") return t("common.backHome");
  const sectionMap: Record<string, string> = {
    "/anime": t("nav.anime"),
    "/k-dramas": t("nav.kdramas"),
    "/hollywood": t("nav.hollywood"),
    "/bollywood": t("nav.bollywood"),
    "/tollywood": t("nav.tollywood"),
    "/nollywood": t("nav.nollywood"),
    "/cartoons": t("nav.cartoons"),
    "/manga": t("nav.manga"),
    "/mood": t("nav.mood"),
    "/watchlist": t("nav.watchlist"),
    "/search": t("nav.search"),
  };
  const label = sectionMap[pathname];
  if (!label) return t("common.backHome");
  return t("common.backToSection").replace("{section}", label);
}

export interface TitleDetailPageProps {
  source: Source;
  id: string;
  season?: number | undefined;
  audio?: AudioOption | undefined;
}

export function TitleDetailPage({ source, id, season, audio }: TitleDetailPageProps) {
  const { lang, t } = useT();
  const navigate = useNavigate();
  const detail = useQuery(detailQuery(source, id, lang));
  const { getReturnTarget, requestScrollRestore } = useWatchReturn();

  const returnTarget = getReturnTarget();
  const backLabel = resolveBackLabel(returnTarget?.pathname, t);

  const goBack = () => {
    const target = getReturnTarget();
    if (target) {
      requestScrollRestore(target.href);
      void navigate({
        to: target.pathname as never,
        search: target.search as never,
      });
      return;
    }
    void navigate({ to: "/" });
  };

  const fallbackItem: MediaItem = detail.data ?? {
    key: itemKey(source, id),
    id,
    source,
    section: inferSectionFromId(source, id),
    title: t("common.loadingTitle"),
    poster: null,
    genres: [],
    description: "",
    mediaType: source === "anilist" ? "tv" : id.startsWith("movie-") ? "movie" : "tv",
  };

  if (detail.isLoading && !detail.data) {
    return (
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-8">
        <Button
          type="button"
          variant="glass"
          size="sm"
          onClick={goBack}
          aria-label={backLabel}
          className="mb-6 min-h-[44px] gap-2 rounded-full px-4 sm:min-h-0"
        >
          <ArrowLeft className="size-4" />
          <span>{backLabel}</span>
        </Button>
        <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-center">
          <Loader2 className="size-10 animate-spin text-cerulean" />
          <p className="text-sm text-muted-foreground">{t("common.loadingEpisodes")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-8">
      <ShowDetailBody
        item={fallbackItem}
        mode="page"
        initialSeason={season}
        initialAudio={audio}
        backLabel={backLabel}
        onBack={goBack}
      />
    </div>
  );
}
