import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Film,
  HardDrive,
  History,
  Play,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LanguageToggle } from "@/components/media/LanguageToggle";
import { MediaImage } from "@/components/media/MediaImage";
import { Button } from "@/components/ui/button";
import { isAnimeItem } from "@/lib/catalog/anime-bridge";
import { useOfflineLibrary } from "@/lib/download/offline-db";
import { useT } from "@/lib/i18n";
import {
  playbackProgress,
  useContinueWatching,
  type ContinueWatchingEntry,
} from "@/lib/player/progress";
import { preloadChunk } from "@/lib/preload-chunks";
import {
  resolvePreferredAnimeAudio,
  userSettings,
  useUserSettings,
  type SkipIntroSeconds,
} from "@/lib/settings/store";
import { cn } from "@/lib/utils";
import { useWatchlist } from "@/lib/watchlist/store";

type HistoryFilter = "all" | "anime" | "other";

const SKIP_INTRO_OPTIONS: SkipIntroSeconds[] = [0, 60, 85, 90];

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function buildResumeSearch(
  entry: ContinueWatchingEntry,
  settings: ReturnType<typeof useUserSettings>,
) {
  const anime = isAnimeItem(entry.item);
  const audio = anime
    ? resolvePreferredAnimeAudio({
        lastWatched: {
          season: entry.season,
          episode: entry.episode,
          audio: entry.audio,
          updatedAt: entry.updatedAt,
        },
        settings,
      })
    : undefined;

  if (entry.item.source === "anilist") {
    return { ep: entry.episode, ...(audio ? { audio } : {}) };
  }
  if (entry.item.mediaType === "movie") {
    return audio ? { audio } : {};
  }
  return {
    season: entry.season,
    ep: entry.episode,
    ...(audio ? { audio } : {}),
  };
}

function SettingSwitch({
  checked,
  label,
  description,
  onToggle,
  onLabel,
  offLabel,
}: {
  checked: boolean;
  label: string;
  description: string;
  onToggle: () => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
      <div className="max-w-xl">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={cn(
          "inline-flex min-h-[44px] shrink-0 items-center gap-2.5 self-start rounded-full border px-3.5 text-xs font-semibold transition sm:min-h-0 sm:self-auto sm:py-2",
          checked
            ? "border-cerulean/50 bg-cerulean/15 text-foreground"
            : "border-foreground/15 bg-foreground/5 text-muted-foreground hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
            checked ? "bg-cerulean" : "bg-foreground/20",
          )}
        >
          <span
            className={cn(
              "inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform",
              checked ? "translate-x-4" : "translate-x-1",
            )}
          />
        </span>
        <span className="min-w-[2.5ch]">{checked ? onLabel : offLabel}</span>
      </button>
    </div>
  );
}

export function SettingsPage() {
  const { lang, t } = useT();
  const settings = useUserSettings();
  const continueList = useContinueWatching();
  const watchlistEntries = useWatchlist();
  const offlineEntries = useOfflineLibrary();

  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [resetNotice, setResetNotice] = useState(false);

  useEffect(() => {
    if (!resetNotice) return;
    const id = window.setTimeout(() => setResetNotice(false), 2600);
    return () => window.clearTimeout(id);
  }, [resetNotice]);

  const counts = useMemo(() => {
    let anime = 0;
    let other = 0;
    for (const entry of continueList) {
      if (isAnimeItem(entry.item)) anime++;
      else other++;
    }
    return { all: continueList.length, anime, other };
  }, [continueList]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") return continueList;
    return continueList.filter((entry) =>
      historyFilter === "anime" ? isAnimeItem(entry.item) : !isAnimeItem(entry.item),
    );
  }, [continueList, historyFilter]);

  const handleReset = () => {
    userSettings.reset();
    setResetNotice(true);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-24 sm:px-8 lg:px-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Button
          asChild
          variant="glass"
          size="sm"
          className="min-h-[44px] gap-2 rounded-full px-4 sm:min-h-0"
        >
          <Link to="/">
            <ArrowLeft className="size-4" />
            <span>{t("common.backHome")}</span>
          </Link>
        </Button>
      </div>

      <header className="border-b border-foreground/10 pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cerulean">
          {t("settings.kicker")}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {t("settings.title")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("settings.subtitle")}
        </p>

        <div className="mt-6 flex items-start gap-3.5 rounded-xl border border-cerulean/25 bg-cerulean/10 p-4 text-left">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-cerulean" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {t("settings.localNoticeTitle")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("settings.localNoticeDesc")}
            </p>
          </div>
        </div>
      </header>

      {/* Playback & Anime Preferences */}
      <section className="mt-10 rounded-2xl border border-foreground/10 bg-surface/80 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/10 pb-4">
          <div className="flex items-center gap-2.5">
            <Sliders className="size-5 text-cerulean" />
            <h2 className="font-display text-xl font-semibold tracking-tight">
              {t("settings.playbackTitle")}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {resetNotice && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cerulean">
                <Check className="size-3.5" />
                {t("settings.resetDone")}
              </span>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-foreground/15 bg-foreground/5 px-3.5 text-xs font-semibold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground sm:min-h-0 sm:py-1.5"
            >
              <RotateCcw className="size-3.5" />
              <span>{t("settings.resetPrefs")}</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-foreground/10">
          {/* Default Anime Audio */}
          <div className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="size-4 text-genre-anime" />
                <span>{t("settings.defaultAnimeAudio")}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("settings.defaultAnimeAudioDesc")}
              </p>
            </div>
            <div
              role="group"
              aria-label={t("settings.defaultAnimeAudio")}
              className="inline-flex shrink-0 flex-wrap gap-2"
            >
              {(["sub", "dub"] as const).map((audioOpt) => {
                const active = settings.defaultAnimeAudio === audioOpt;
                return (
                  <button
                    key={audioOpt}
                    type="button"
                    aria-pressed={active}
                    onClick={() => userSettings.update({ defaultAnimeAudio: audioOpt })}
                    className={cn(
                      "min-h-[44px] rounded-lg border px-3.5 py-2 text-xs font-semibold transition sm:min-h-0",
                      active
                        ? "border-transparent bg-brand-gradient text-primary-foreground shadow-sm"
                        : "border-foreground/15 bg-foreground/5 text-foreground/80 hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {audioOpt === "sub" ? t("settings.animeSubOpt") : t("settings.animeDubOpt")}
                  </button>
                );
              })}
            </div>
          </div>

          <SettingSwitch
            checked={settings.autoPlayNext}
            label={t("settings.autoPlayNext")}
            description={t("settings.autoPlayNextDesc")}
            onToggle={() => userSettings.update({ autoPlayNext: !settings.autoPlayNext })}
            onLabel={t("settings.on")}
            offLabel={t("settings.off")}
          />

          <SettingSwitch
            checked={settings.autoShowSubtitles}
            label={t("settings.autoShowSubtitles")}
            description={t("settings.autoShowSubtitlesDesc")}
            onToggle={() => userSettings.update({ autoShowSubtitles: !settings.autoShowSubtitles })}
            onLabel={t("settings.on")}
            offLabel={t("settings.off")}
          />

          <SettingSwitch
            checked={settings.downloadIncludeSubtitles}
            label={t("settings.downloadIncludeSubs")}
            description={t("settings.downloadIncludeSubsDesc")}
            onToggle={() =>
              userSettings.update({
                downloadIncludeSubtitles: !settings.downloadIncludeSubtitles,
              })
            }
            onLabel={t("settings.on")}
            offLabel={t("settings.off")}
          />

          {/* Skip Intro Duration */}
          <div className="flex flex-col justify-between gap-4 py-5 sm:flex-row sm:items-center">
            <div className="max-w-xl">
              <div className="text-sm font-semibold text-foreground">{t("settings.skipIntro")}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("settings.skipIntroDesc")}
              </p>
            </div>
            <div
              role="group"
              aria-label={t("settings.skipIntro")}
              className="inline-flex shrink-0 items-center gap-1.5"
            >
              {SKIP_INTRO_OPTIONS.map((sec) => {
                const active = settings.skipIntroSeconds === sec;
                return (
                  <button
                    key={sec}
                    type="button"
                    aria-pressed={active}
                    onClick={() => userSettings.update({ skipIntroSeconds: sec })}
                    className={cn(
                      "min-h-[44px] min-w-[3.25rem] rounded-lg border px-3 py-1.5 text-xs font-semibold tabular-nums transition sm:min-h-0",
                      active
                        ? "border-transparent bg-brand-gradient text-primary-foreground shadow-sm"
                        : "border-foreground/15 bg-foreground/5 text-foreground/80 hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {sec === 0 ? t("settings.skipIntroOff") : `${sec}s`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language Switch */}
          <div className="flex flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center">
            <div className="max-w-xl">
              <div className="text-sm font-semibold text-foreground">{t("settings.language")}</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("settings.languageDesc")}
              </p>
            </div>
            <LanguageToggle />
          </div>
        </div>
      </section>

      {/* Watch History & Continue Watching Manager */}
      <section className="mt-8 rounded-2xl border border-foreground/10 bg-surface/80 p-5 sm:p-7">
        <div className="flex flex-col gap-4 border-b border-foreground/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <History className="size-5 text-cerulean" />
              <h2 className="font-display text-xl font-semibold tracking-tight">
                {t("settings.historyTitle")}
              </h2>
            </div>
            <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
              {t("settings.historySubtitle")}
            </p>
          </div>

          {continueList.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {counts.anime > 0 && (
                <button
                  type="button"
                  onClick={() => playbackProgress.clearHistory("anime")}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-foreground/15 bg-foreground/5 px-3 py-1.5 text-xs font-semibold text-foreground/85 transition hover:border-destructive/60 hover:bg-destructive/15 hover:text-foreground sm:min-h-0"
                >
                  <Trash2 className="size-3.5" />
                  <span>{t("settings.clearAnimeHistory")}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => playbackProgress.clearHistory("all")}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/15 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-destructive/25 sm:min-h-0"
              >
                <Trash2 className="size-3.5 text-destructive" />
                <span>{t("settings.clearAllHistory")}</span>
              </button>
            </div>
          )}
        </div>

        {/* History Filter Tabs */}
        <div
          role="tablist"
          aria-label={t("settings.historyTitle")}
          className="mt-5 flex flex-wrap gap-2"
        >
          {(
            [
              { id: "all", label: t("settings.historyFilterAll"), count: counts.all },
              { id: "anime", label: t("settings.historyFilterAnime"), count: counts.anime },
              { id: "other", label: t("settings.historyFilterOther"), count: counts.other },
            ] as const
          ).map((tab) => {
            const active = historyFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setHistoryFilter(tab.id)}
                className={cn(
                  "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition sm:min-h-0",
                  active
                    ? "border-transparent bg-brand-gradient text-primary-foreground shadow-sm"
                    : "border-foreground/15 bg-foreground/5 text-foreground/80 hover:border-foreground/30 hover:text-foreground",
                )}
              >
                <span>{tab.label}</span>
                <span className="tabular-nums opacity-80">{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* History Items */}
        {continueList.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-foreground/15 px-5 py-10 text-center">
            <Film className="mx-auto size-8 text-muted-foreground/60" />
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              {t("settings.historyEmpty")}
            </p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-foreground/15 px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">{t("settings.historyNoMatch")}</p>
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-foreground/10">
            {filteredHistory.map((entry) => {
              const anime = isAnimeItem(entry.item);
              const pct =
                entry.duration > 30 && entry.currentTime > 1
                  ? Math.min(
                      100,
                      Math.max(2, Math.round((entry.currentTime / entry.duration) * 100)),
                    )
                  : null;
              const isSerial = entry.item.mediaType !== "movie";
              const epText = isSerial
                ? entry.item.source !== "anilist" && entry.season > 1
                  ? `S${entry.season}·${lang === "fr" ? "Ép." : "Ep"} ${entry.episode}`
                  : `${lang === "fr" ? "Ép." : "Ep"} ${entry.episode}`
                : t("watch.fullMovie");

              return (
                <li
                  key={entry.item.key}
                  className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3.5">
                    <Link
                      to="/title/$source/$id"
                      params={{ source: entry.item.source, id: entry.item.id }}
                      onMouseEnter={() => preloadChunk("/title")}
                      className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-background ring-1 ring-foreground/10"
                    >
                      <MediaImage
                        src={entry.item.poster ?? entry.item.posterHd}
                        fallbackSrc={entry.item.backdrop}
                        source={entry.item.source}
                        itemId={entry.item.id}
                        imdbId={entry.item.imdbId}
                        alt={entry.item.title}
                        className="size-full object-cover"
                      />
                    </Link>

                    <div className="min-w-0 flex-1">
                      <Link
                        to="/title/$source/$id"
                        params={{ source: entry.item.source, id: entry.item.id }}
                        onMouseEnter={() => preloadChunk("/title")}
                        className="block truncate text-sm font-semibold text-foreground transition hover:text-cerulean"
                      >
                        {entry.item.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground tabular-nums">
                        <span className={anime ? "text-genre-anime font-medium" : undefined}>
                          {anime
                            ? "Anime"
                            : entry.item.mediaType === "movie"
                              ? lang === "fr"
                                ? "Film"
                                : "Movie"
                              : lang === "fr"
                                ? "Série"
                                : "Series"}
                        </span>
                        <span>·</span>
                        <span>{epText}</span>
                        {entry.audio && (
                          <>
                            <span>·</span>
                            <span className="uppercase">{entry.audio}</span>
                          </>
                        )}
                        {entry.currentTime > 1 && (
                          <>
                            <span>·</span>
                            <span>
                              {formatClock(entry.currentTime)}
                              {entry.duration > 1 ? ` / ${formatClock(entry.duration)}` : ""}
                            </span>
                          </>
                        )}
                      </div>
                      {pct !== null && (
                        <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className="h-full rounded-full bg-brand-gradient"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      to="/watch/$source/$id"
                      params={{ source: entry.item.source, id: entry.item.id }}
                      search={buildResumeSearch(entry, settings)}
                      onMouseEnter={() => preloadChunk("/watch")}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-foreground/10 px-3.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-brand-gradient hover:text-primary-foreground sm:min-h-0"
                    >
                      <Play className="size-3.5 fill-current" />
                      <span>{t("settings.resumeItem")}</span>
                    </Link>
                    <button
                      type="button"
                      aria-label={t("settings.deleteItemAria").replace("{title}", entry.item.title)}
                      onClick={() =>
                        playbackProgress.removeShowHistory(entry.item.source, entry.item.id)
                      }
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-foreground/15 bg-foreground/5 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-destructive/50 hover:bg-destructive/15 hover:text-foreground sm:min-h-0"
                    >
                      <Trash2 className="size-3.5" />
                      <span>{t("settings.deleteItem")}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Local Browser Storage Overview */}
      <section className="mt-8 rounded-2xl border border-foreground/10 bg-surface/80 p-5 sm:p-7">
        <div className="flex items-center gap-2.5 border-b border-foreground/10 pb-4">
          <HardDrive className="size-5 text-cerulean" />
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {t("settings.storageOverview")}
          </h2>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-foreground/10 bg-background/40 p-4">
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {continueList.length}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("settings.storageHistoryCount")}
            </div>
          </div>
          <div className="rounded-xl border border-foreground/10 bg-background/40 p-4">
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {watchlistEntries.length}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("settings.storageWatchlistCount")}
            </div>
          </div>
          <div className="rounded-xl border border-foreground/10 bg-background/40 p-4">
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {offlineEntries.length}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("settings.storageOfflineCount")}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/watchlist"
            onMouseEnter={() => preloadChunk("/watchlist")}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-foreground/15 bg-foreground/5 px-4 py-2 text-xs font-semibold text-foreground transition hover:border-foreground/30 hover:bg-foreground/10 sm:min-h-0"
          >
            {t("settings.openWatchlist")}
          </Link>
          <Link
            to="/watchlist"
            search={{ tab: "offline" }}
            onMouseEnter={() => preloadChunk("/watchlist")}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-foreground/15 bg-foreground/5 px-4 py-2 text-xs font-semibold text-foreground transition hover:border-foreground/30 hover:bg-foreground/10 sm:min-h-0"
          >
            {t("settings.openOffline")}
          </Link>
        </div>
      </section>
    </div>
  );
}
