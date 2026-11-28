import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cachedAsync } from "@/lib/cache/client-cache";
import { translateMangaGenre, useT, type TranslationKey } from "@/lib/i18n";
import {
  fetchMangaChapterPageUrls,
  fetchMangaChaptersList,
  fetchMangaList,
} from "@/lib/manga/mangadex";
import {
  getMangaCatalog,
  getMangaChapterPages,
  getMangaChapters,
} from "@/lib/manga/manga.functions";
import {
  MANGA_GENRE_TAGS,
  type MangaChapter,
  type MangaFeedKind,
  type MangaItem,
  type MangaPageSource,
} from "@/lib/manga/types";
import { cn } from "@/lib/utils";

const FEED_TABS: { id: MangaFeedKind; labelKey: TranslationKey }[] = [
  { id: "latest", labelKey: "manga.feedLatest" },
  { id: "popular", labelKey: "manga.feedPopular" },
  { id: "top", labelKey: "manga.feedTop" },
  { id: "newest", labelKey: "manga.feedNewest" },
];

const GENRES = ["All", ...Object.keys(MANGA_GENRE_TAGS)];

function resolveCoverCandidates(item: MangaItem): string[] {
  const candidates: string[] = [];
  const push = (u: string | null | undefined) => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };

  const rawCover = item.coverUrl;
  if (rawCover) {
    if (rawCover.startsWith("/api/manga/cover")) {
      try {
        const parsed = new URL(rawCover, "https://shadow.local");
        const mangaId = parsed.searchParams.get("mangaId");
        const file = parsed.searchParams.get("file");
        if (mangaId && file) {
          push(
            `https://uploads.mangadex.org/covers/${encodeURIComponent(mangaId)}/${encodeURIComponent(file)}.512.jpg`,
          );
          push(
            `https://uploads.mangadex.org/covers/${encodeURIComponent(mangaId)}/${encodeURIComponent(file)}`,
          );
        }
      } catch {
        /* ignore malformed proxy path */
      }
      push(rawCover);
    } else {
      push(rawCover);
      const match = rawCover.match(
        /^https:\/\/uploads\.mangadex\.org\/covers\/([^/]+)\/([^/?#]+?)(?:\.(?:256|512)\.jpg)?$/,
      );
      if (match) {
        const [, mangaId, file] = match;
        if (mangaId && file) {
          push(`https://uploads.mangadex.org/covers/${mangaId}/${file}`);
          push(
            item.coverFallbackUrl ??
              `/api/manga/cover?mangaId=${encodeURIComponent(mangaId)}&file=${encodeURIComponent(file)}`,
          );
        }
      }
    }
  }
  push(item.coverFallbackUrl);
  return candidates;
}

function MangaCover({ item }: { item: MangaItem }) {
  const candidates = useMemo(() => resolveCoverCandidates(item), [item]);
  const [candidateIdx, setCandidateIdx] = useState(0);

  useEffect(() => {
    setCandidateIdx(0);
  }, [item.id, item.coverUrl, item.coverFallbackUrl]);

  const activeSrc = candidates[candidateIdx];
  if (!activeSrc) {
    return (
      <div className="flex size-full flex-col items-center justify-center bg-surface p-3 text-center">
        <BookOpen className="mb-2 size-7 text-muted-foreground/60" />
        <p className="line-clamp-3 font-display text-xs font-semibold text-muted-foreground">
          {item.title}
        </p>
      </div>
    );
  }

  return (
    <img
      src={activeSrc}
      alt={`${item.title} cover`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setCandidateIdx((i) => i + 1)}
      className="size-full object-cover transition duration-500 group-hover/card:scale-105"
    />
  );
}

function normalizePageSource(entry: string | MangaPageSource): {
  url: string;
  fallbackUrl: string | null;
} {
  if (typeof entry === "string") {
    return { url: entry, fallbackUrl: null };
  }
  return { url: entry.url, fallbackUrl: entry.fallbackUrl || null };
}

function MangaReaderImage({
  entry,
  pageNumber,
}: {
  entry: string | MangaPageSource;
  pageNumber: number;
}) {
  const { t } = useT();
  const { url, fallbackUrl } = useMemo(() => normalizePageSource(entry), [entry]);
  const [useFallback, setUseFallback] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUseFallback(false);
    setFailed(false);
  }, [url, fallbackUrl]);

  const activeSrc = useFallback && fallbackUrl ? fallbackUrl : url;

  if (failed) {
    return (
      <div className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded bg-surface px-4 text-center text-xs text-muted-foreground">
        <p>
          {t("manga.page")} {pageNumber} {t("manga.pageFailed")}
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setFailed(false);
            setUseFallback(false);
          }}
        >
          <RefreshCw className="size-3.5" /> {t("common.retry")}
        </Button>
      </div>
    );
  }

  return (
    <img
      src={activeSrc}
      alt={`${t("manga.page")} ${pageNumber}`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!useFallback && fallbackUrl && fallbackUrl !== activeSrc) {
          setUseFallback(true);
        } else {
          setFailed(true);
        }
      }}
      className="w-full rounded bg-surface object-contain [content-visibility:auto] [contain-intrinsic-size:auto_900px]"
    />
  );
}

function downloadChapterHref(chapterId: string, title: string, chNum: string) {
  const params = new URLSearchParams({
    chapterId,
    title: `${title}-Ch-${chNum}`,
  });
  return `/api/manga/download?${params.toString()}`;
}

function downloadQuickHref(mangaId: string, title: string, lang: "en" | "fr") {
  const params = new URLSearchParams({
    mangaId,
    which: "latest",
    title,
    lang,
  });
  return `/api/manga/download?${params.toString()}`;
}

const READER_PAGE_BATCH = 24;

export function MangaPage() {
  const { lang, t } = useT();
  const [feed, setFeed] = useState<MangaFeedKind>("latest");
  const [genre, setGenre] = useState<string>("All");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedManga, setSelectedManga] = useState<MangaItem | null>(null);
  const [readingChapter, setReadingChapter] = useState<MangaChapter | null>(null);
  const [visiblePageCount, setVisiblePageCount] = useState(READER_PAGE_BATCH);
  const readerScrollRef = useRef<HTMLDivElement>(null);
  const loadMorePagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const isTestEnv = (import.meta.env as Record<string, unknown> | undefined)?.["MODE"] === "test";

  const catalog = useQuery({
    queryKey: ["manga-catalog", lang, feed, genre, debouncedQ, offset],
    queryFn: () =>
      cachedAsync(
        `manga:catalog:v4:${lang}:${feed}:${genre}:${debouncedQ}:${offset}`,
        1000 * 60 * 30,
        async () => {
          try {
            return await fetchMangaList({
              feed,
              genre: genre !== "All" ? genre : undefined,
              q: debouncedQ || undefined,
              limit: 30,
              offset,
              lang,
            });
          } catch (browserError) {
            if (isTestEnv) throw browserError;
            return getMangaCatalog({
              data: {
                feed,
                genre,
                q: debouncedQ || undefined,
                offset,
                lang,
              },
            });
          }
        },
        { persist: "session" },
      ),
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60,
  });

  const chaptersQuery = useQuery({
    queryKey: ["manga-chapters", lang, selectedManga?.id],
    queryFn: () =>
      cachedAsync(
        `manga:chapters:v3:${lang}:${selectedManga!.id}`,
        1000 * 60 * 30,
        async () => {
          try {
            return await fetchMangaChaptersList(selectedManga!.id, lang);
          } catch (browserError) {
            if (isTestEnv) throw browserError;
            return getMangaChapters({ data: { mangaId: selectedManga!.id, lang } });
          }
        },
        { persist: "session" },
      ),
    enabled: Boolean(selectedManga),
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60,
  });

  const pagesQuery = useQuery({
    queryKey: ["manga-pages", readingChapter?.id],
    queryFn: () =>
      cachedAsync(
        `manga:pages:v3:${readingChapter!.id}`,
        1000 * 60 * 30,
        async () => {
          try {
            return await fetchMangaChapterPageUrls(readingChapter!.id);
          } catch (browserError) {
            if (isTestEnv) throw browserError;
            return getMangaChapterPages({ data: { chapterId: readingChapter!.id } });
          }
        },
        { persist: "session" },
      ),
    enabled: Boolean(readingChapter),
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60,
  });

  const chapters = chaptersQuery.data ?? [];
  const activeIdx = readingChapter ? chapters.findIndex((c) => c.id === readingChapter.id) : -1;
  const prevChapter = activeIdx > 0 ? (chapters[activeIdx - 1] ?? null) : null;
  const nextChapter =
    activeIdx >= 0 && activeIdx + 1 < chapters.length ? (chapters[activeIdx + 1] ?? null) : null;

  useEffect(() => {
    if (!readingChapter) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setReadingChapter(null);
      } else if (e.key === "ArrowLeft" && prevChapter) {
        e.preventDefault();
        setReadingChapter(prevChapter);
      } else if (e.key === "ArrowRight" && nextChapter) {
        e.preventDefault();
        setReadingChapter(nextChapter);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readingChapter, prevChapter, nextChapter]);

  const totalPages = pagesQuery.data?.length ?? 0;

  useEffect(() => {
    setVisiblePageCount(READER_PAGE_BATCH);
    if (readerScrollRef.current) {
      readerScrollRef.current.scrollTop = 0;
    }
  }, [readingChapter?.id]);

  useEffect(() => {
    const sentinel = loadMorePagesRef.current;
    if (!sentinel || visiblePageCount >= totalPages) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisiblePageCount((prev) => Math.min(totalPages, prev + READER_PAGE_BATCH));
        }
      },
      { root: readerScrollRef.current, rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visiblePageCount, totalPages, readingChapter?.id]);

  const items = catalog.data?.items ?? [];
  const total = catalog.data?.total ?? items.length;

  const clearSearch = () => {
    setQ("");
    setDebouncedQ("");
    setOffset(0);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQ(q.trim());
    setOffset(0);
  };

  return (
    <div className="px-4 pb-16 pt-24 sm:px-8 lg:px-12">
      <header className="mb-8 border-b border-foreground/10 pb-6">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cerulean">
          <BookOpen className="size-4" /> {t("manga.kicker")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {t("manga.title")}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("manga.subtitle")}
        </p>
      </header>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label={t("manga.feedsAria")} className="flex flex-wrap gap-2">
          {FEED_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={feed === tab.id && !debouncedQ}
              onClick={() => {
                setFeed(tab.id);
                setQ("");
                setDebouncedQ("");
                setOffset(0);
              }}
              className={cn(
                "min-h-[44px] whitespace-nowrap rounded-md border px-3.5 py-2 text-xs font-semibold transition sm:min-h-0 sm:py-1.5",
                feed === tab.id && !debouncedQ
                  ? "border-cerulean bg-brand-gradient text-primary-foreground"
                  : "border-foreground/10 bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <form
          role="search"
          onSubmit={handleSearchSubmit}
          className="flex w-full items-center gap-2 lg:w-96"
        >
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("manga.searchPlaceholder")}
              aria-label={t("manga.searchAria")}
              className={cn("min-h-[44px] pl-9 sm:min-h-0", q ? "pr-9" : "")}
            />
            {q && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label={t("shell.clearSearch")}
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface-raised hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <Button type="submit" size="sm" variant="secondary" className="min-h-[44px] sm:min-h-9">
            {t("manga.searchBtn")}
          </Button>
        </form>
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5" role="group" aria-label={t("genre.filterAria")}>
        {GENRES.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={genre === g}
            onClick={() => {
              setGenre(g);
              setOffset(0);
            }}
            className={cn(
              "min-h-[44px] whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-medium transition sm:min-h-0 sm:px-2.5 sm:py-1",
              genre === g
                ? "border-cerulean/60 bg-cerulean/15 text-foreground"
                : "border-foreground/10 bg-surface/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {translateMangaGenre(g, lang)}
          </button>
        ))}
      </div>

      {debouncedQ && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-foreground/10 bg-surface/60 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            {catalog.isFetching ? (
              <Loader2 className="size-3.5 animate-spin text-cerulean" />
            ) : (
              <Search className="size-3.5 text-cerulean" />
            )}
            <span>
              {t("search.resultsFor")} <strong className="text-foreground">“{debouncedQ}”</strong>
              {genre !== "All" && (
                <>
                  {" "}
                  {t("manga.in")}{" "}
                  <strong className="text-foreground">{translateMangaGenre(genre, lang)}</strong>
                </>
              )}
              {!catalog.isLoading && (
                <span className="ml-1.5 tabular-nums">
                  ({total} {t("manga.found")})
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={clearSearch}
            className="font-semibold text-cerulean transition hover:underline"
          >
            {t("shell.clearSearch")}
          </button>
        </div>
      )}

      {catalog.isLoading ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="aspect-[2/3] rounded-lg skeleton-shimmer" />
          ))}
        </div>
      ) : catalog.isError ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <p className="font-display text-lg font-semibold">{t("manga.errorLoad")}</p>
          <Button variant="brand" onClick={() => void catalog.refetch()}>
            <RefreshCw className="size-4" /> {t("common.retry")}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {t("manga.emptyPrefix")} {debouncedQ ? `“${debouncedQ}”` : t("manga.emptyFilters")}{" "}
            {t("manga.emptySuffix")}
          </p>
          {(debouncedQ || genre !== "All") && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                clearSearch();
                setGenre("All");
              }}
            >
              {t("manga.resetFilters")}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            {items.map((item) => (
              <article
                key={item.id}
                className="group/card flex min-w-0 flex-col overflow-hidden rounded-lg border border-foreground/10 bg-surface/60"
              >
                <button
                  type="button"
                  onClick={() => setSelectedManga(item)}
                  aria-label={
                    lang === "fr"
                      ? `Ouvrir les chapitres de ${item.title}`
                      : `Open ${item.title} chapters`
                  }
                  className="relative aspect-[2/3] w-full overflow-hidden bg-scrim text-left"
                >
                  <MangaCover item={item} />
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {item.genres[0] && (
                      <span className="text-cerulean">
                        {translateMangaGenre(item.genres[0], lang)}
                      </span>
                    )}
                    {item.genres[0] && (item.lastChapter || item.year) && (
                      <span aria-hidden="true">·</span>
                    )}
                    {item.lastChapter ? (
                      <span className="tabular-nums">Ch. {item.lastChapter}</span>
                    ) : (
                      item.year && <span className="tabular-nums">{item.year}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedManga(item)}
                    className="text-left font-bold leading-snug line-clamp-2 transition hover:text-cerulean"
                  >
                    {item.title}
                  </button>
                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    <Button asChild size="sm" className="w-full">
                      <a
                        href={downloadQuickHref(item.id, item.title, lang)}
                        download
                        aria-label={
                          lang === "fr"
                            ? `${t("manga.freeDownload")} ${item.title}`
                            : `Free download ${item.title}`
                        }
                      >
                        <Download className="size-3.5" /> {t("manga.freeDownload")}
                      </a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedManga(item)}
                      className="w-full"
                    >
                      <BookOpen className="size-3.5" /> {t("manga.chapters")}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-10 flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - 30))}
            >
              {t("manga.prevPage")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={items.length < 30 || (total > 0 && offset + items.length >= total)}
              onClick={() => setOffset((o) => o + 30)}
            >
              {t("manga.nextPage")}
            </Button>
          </div>
        </>
      )}

      {/* Chapters & Info Modal */}
      <Dialog
        open={Boolean(selectedManga)}
        onOpenChange={(open) => {
          if (!open) setSelectedManga(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-foreground/10 bg-popover p-6 sm:rounded-2xl">
          {selectedManga && (
            <div className="space-y-5">
              <div className="flex flex-col gap-5 sm:flex-row">
                <div className="aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-lg bg-scrim">
                  <MangaCover item={selectedManga} />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <DialogTitle className="font-display text-2xl font-bold leading-tight">
                    {selectedManga.title}
                  </DialogTitle>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {selectedManga.year && (
                      <span className="tabular-nums">{selectedManga.year}</span>
                    )}
                    {selectedManga.status && (
                      <>
                        {selectedManga.year && <span aria-hidden="true">·</span>}
                        <span className="capitalize">{selectedManga.status}</span>
                      </>
                    )}
                    {selectedManga.genres.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{selectedManga.genres.join(" · ")}</span>
                      </>
                    )}
                  </div>
                  <DialogDescription className="text-sm leading-relaxed text-foreground/85 line-clamp-4">
                    {selectedManga.description || t("manga.modalDescFallback")}
                  </DialogDescription>
                </div>
              </div>

              <div className="border-t border-foreground/10 pt-4">
                <h2 className="mb-3 font-display text-sm font-semibold">
                  {t("manga.chapters")}{" "}
                  {chapters.length > 0 && (
                    <span className="tabular-nums text-muted-foreground">· {chapters.length}</span>
                  )}
                </h2>

                {chaptersQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-6 animate-spin text-cerulean" />
                  </div>
                ) : chaptersQuery.isError ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      {t("manga.chaptersUnavailable")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void chaptersQuery.refetch()}
                    >
                      <RefreshCw className="size-3.5" /> {t("common.retry")}
                    </Button>
                  </div>
                ) : chapters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("manga.noChapters")}</p>
                ) : (
                  <ol
                    data-testid="manga-chapter-list"
                    className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1"
                  >
                    {chapters.map((ch) => (
                      <li
                        key={ch.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-foreground/5 bg-surface/60 px-3 py-2 transition hover:border-cerulean/40 hover:bg-surface sm:flex-nowrap sm:gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => setReadingChapter(ch)}
                          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left sm:min-h-0"
                        >
                          <span className="w-14 shrink-0 font-display text-sm font-semibold tabular-nums">
                            Ch. {ch.chapter}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                            {ch.title || `${ch.pages} pages`}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="min-h-[44px] sm:min-h-0"
                            onClick={() => setReadingChapter(ch)}
                          >
                            {t("manga.read")}
                          </Button>
                          <Button asChild size="sm" className="min-h-[44px] sm:min-h-0">
                            <a
                              href={downloadChapterHref(ch.id, selectedManga.title, ch.chapter)}
                              download
                              aria-label={
                                lang === "fr"
                                  ? `Télécharger gratuitement le chapitre ${ch.chapter}`
                                  : `Free download chapter ${ch.chapter}`
                              }
                            >
                              <Download className="size-3.5" /> {t("manga.freeCbz")}
                            </a>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Fullscreen Chapter Reader */}
      {selectedManga && readingChapter && (
        <div
          role="dialog"
          aria-label={`${selectedManga.title} ${t("manga.chapter")} ${readingChapter.chapter}`}
          className="fixed inset-0 z-50 flex flex-col bg-scrim"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/10 bg-background/95 px-3 py-2.5 backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold sm:text-base">
                {selectedManga.title}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {t("manga.chapter")} {readingChapter.chapter}
                {readingChapter.title ? ` — ${readingChapter.title}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Button
                type="button"
                size="sm"
                variant="glass"
                className="min-h-[44px] sm:min-h-0"
                disabled={!prevChapter}
                onClick={() => prevChapter && setReadingChapter(prevChapter)}
                aria-label={t("manga.prevChapterAria")}
              >
                <ChevronLeft className="size-4" /> {t("manga.prev")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="glass"
                className="min-h-[44px] sm:min-h-0"
                disabled={!nextChapter}
                onClick={() => nextChapter && setReadingChapter(nextChapter)}
                aria-label={t("manga.nextChapterAria")}
              >
                {t("manga.next")} <ChevronRight className="size-4" />
              </Button>
              <Button asChild size="sm" className="min-h-[44px] sm:min-h-0">
                <a
                  href={downloadChapterHref(
                    readingChapter.id,
                    selectedManga.title,
                    readingChapter.chapter,
                  )}
                  download
                >
                  <Download className="size-3.5" /> {t("common.download")}
                </a>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                aria-label={t("manga.closeReaderAria")}
                onClick={() => setReadingChapter(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div ref={readerScrollRef} className="flex-1 overflow-y-auto px-2 py-6 sm:px-6">
            {pagesQuery.isLoading ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
                <Loader2 className="size-10 animate-spin text-cerulean" />
                <p className="text-sm text-muted-foreground">{t("manga.loadingPages")}</p>
              </div>
            ) : pagesQuery.isError || !pagesQuery.data?.length ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
                <p className="font-display text-lg font-semibold">{t("manga.pagesUnavailable")}</p>
                <Button asChild size="sm">
                  <a
                    href={downloadChapterHref(
                      readingChapter.id,
                      selectedManga.title,
                      readingChapter.chapter,
                    )}
                    download
                  >
                    <Download className="size-4" /> {t("manga.tryCbz")}
                  </a>
                </Button>
              </div>
            ) : (
              <div className="mx-auto flex max-w-3xl flex-col gap-2">
                {pagesQuery.data.slice(0, visiblePageCount).map((entry, idx) => (
                  <MangaReaderImage
                    key={typeof entry === "string" ? entry : entry.url}
                    entry={entry}
                    pageNumber={idx + 1}
                  />
                ))}
                {visiblePageCount < pagesQuery.data.length && (
                  <div ref={loadMorePagesRef} className="flex justify-center py-6">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setVisiblePageCount((prev) =>
                          Math.min(pagesQuery.data!.length, prev + READER_PAGE_BATCH),
                        )
                      }
                    >
                      {t("manga.loadMorePages")} ({visiblePageCount}/{pagesQuery.data.length})
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
