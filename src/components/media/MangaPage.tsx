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
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
} from "@/lib/manga/mangadex";
import { cn } from "@/lib/utils";

const FEED_TABS: { id: MangaFeedKind; label: string }[] = [
  { id: "latest", label: "New Releases" },
  { id: "popular", label: "Popular" },
  { id: "top", label: "Top Rated" },
  { id: "newest", label: "Newly Added" },
];

const GENRES = ["All", ...Object.keys(MANGA_GENRE_TAGS)];

function MangaCover({ item }: { item: MangaItem }) {
  const [broken, setBroken] = useState(false);

  if (!item.coverUrl || broken) {
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
      src={item.coverUrl}
      alt={`${item.title} cover`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="size-full object-cover transition duration-500 group-hover/card:scale-105"
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

function downloadQuickHref(mangaId: string, title: string) {
  const params = new URLSearchParams({
    mangaId,
    which: "latest",
    title,
  });
  return `/api/manga/download?${params.toString()}`;
}

export function MangaPage() {
  const [feed, setFeed] = useState<MangaFeedKind>("latest");
  const [genre, setGenre] = useState<string>("All");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedManga, setSelectedManga] = useState<MangaItem | null>(null);
  const [readingChapter, setReadingChapter] = useState<MangaChapter | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const catalog = useQuery({
    queryKey: ["manga-catalog", feed, genre, debouncedQ, offset],
    queryFn: () =>
      getMangaCatalog({
        data: {
          feed,
          genre,
          q: debouncedQ || undefined,
          offset,
        },
      }),
    staleTime: 1000 * 60 * 3,
  });

  const chaptersQuery = useQuery({
    queryKey: ["manga-chapters", selectedManga?.id],
    queryFn: () => getMangaChapters({ data: { mangaId: selectedManga!.id } }),
    enabled: Boolean(selectedManga),
    staleTime: 1000 * 60 * 10,
  });

  const pagesQuery = useQuery({
    queryKey: ["manga-pages", readingChapter?.id],
    queryFn: () => getMangaChapterPages({ data: { chapterId: readingChapter!.id } }),
    enabled: Boolean(readingChapter),
    staleTime: 1000 * 60 * 20,
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

  const items = catalog.data?.items ?? [];

  return (
    <div className="px-4 pb-16 pt-24 sm:px-8 lg:px-12">
      <header className="mb-8 border-b border-foreground/10 pb-6">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cerulean">
          <BookOpen className="size-4" /> Free Manga Library
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Manga</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Read chapters online or download full chapters free as CBZ comic archives. New manga
          releases and freshly translated chapters appear here automatically.
        </p>
      </header>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Manga feeds" className="flex flex-wrap gap-2">
          {FEED_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={feed === t.id && !debouncedQ}
              onClick={() => {
                setFeed(t.id);
                setOffset(0);
              }}
              className={cn(
                "rounded-md border px-3.5 py-1.5 text-xs font-semibold transition whitespace-nowrap",
                feed === t.id && !debouncedQ
                  ? "border-cerulean bg-brand-gradient text-primary-foreground"
                  : "border-foreground/10 bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search manga title…"
            aria-label="Search manga"
            className="pl-9"
          />
        </label>
      </div>

      <div className="mb-8 flex flex-wrap gap-1.5" role="group" aria-label="Filter by genre">
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
              "rounded-md border px-2.5 py-1 text-xs font-medium transition whitespace-nowrap",
              genre === g
                ? "border-cerulean/60 bg-cerulean/15 text-foreground"
                : "border-foreground/10 bg-surface/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {g}
          </button>
        ))}
      </div>

      {catalog.isLoading ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="aspect-[2/3] rounded-lg skeleton-shimmer" />
          ))}
        </div>
      ) : catalog.isError ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <p className="font-display text-lg font-semibold">Unable to load live manga catalog</p>
          <Button variant="brand" onClick={() => void catalog.refetch()}>
            <RefreshCw className="size-4" /> Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No manga matched those filters right now. Try another search or genre.
        </p>
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
                  aria-label={`Open ${item.title} chapters`}
                  className="relative aspect-[2/3] w-full overflow-hidden bg-scrim text-left"
                >
                  <MangaCover item={item} />
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {item.genres[0] && <span className="text-cerulean">{item.genres[0]}</span>}
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
                        href={downloadQuickHref(item.id, item.title)}
                        download
                        aria-label={`Free download ${item.title}`}
                      >
                        <Download className="size-3.5" /> Free Download
                      </a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedManga(item)}
                      className="w-full"
                    >
                      <BookOpen className="size-3.5" /> Chapters
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
              Previous page
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={items.length < 30}
              onClick={() => setOffset((o) => o + 30)}
            >
              Next page
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
                    {selectedManga.description ||
                      "Read chapters online or download CBZ archives free."}
                  </DialogDescription>
                </div>
              </div>

              <div className="border-t border-foreground/10 pt-4">
                <h2 className="mb-3 font-display text-sm font-semibold">
                  Chapters{" "}
                  {chapters.length > 0 && (
                    <span className="tabular-nums text-muted-foreground">· {chapters.length}</span>
                  )}
                </h2>

                {chaptersQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-6 animate-spin text-cerulean" />
                  </div>
                ) : chaptersQuery.isError ? (
                  <p className="text-sm text-muted-foreground">
                    Chapter list is temporarily unavailable.
                  </p>
                ) : chapters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No English chapters available for this title yet.
                  </p>
                ) : (
                  <ol
                    data-testid="manga-chapter-list"
                    className="flex max-h-80 flex-col gap-1 overflow-y-auto pr-1"
                  >
                    {chapters.map((ch) => (
                      <li
                        key={ch.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-foreground/5 bg-surface/60 px-3 py-2 transition hover:border-cerulean/40 hover:bg-surface"
                      >
                        <button
                          type="button"
                          onClick={() => setReadingChapter(ch)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                            onClick={() => setReadingChapter(ch)}
                          >
                            Read
                          </Button>
                          <Button asChild size="sm">
                            <a
                              href={downloadChapterHref(ch.id, selectedManga.title, ch.chapter)}
                              download
                              aria-label={`Free download chapter ${ch.chapter}`}
                            >
                              <Download className="size-3.5" /> Free CBZ
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
          aria-label={`${selectedManga.title} Chapter ${readingChapter.chapter}`}
          className="fixed inset-0 z-50 flex flex-col bg-scrim"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/10 bg-background/95 px-4 py-3 backdrop-blur-xl">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold sm:text-base">
                {selectedManga.title}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                Chapter {readingChapter.chapter}
                {readingChapter.title ? ` — ${readingChapter.title}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="glass"
                disabled={!prevChapter}
                onClick={() => prevChapter && setReadingChapter(prevChapter)}
                aria-label="Previous chapter"
              >
                <ChevronLeft className="size-4" /> Prev
              </Button>
              <Button
                type="button"
                size="sm"
                variant="glass"
                disabled={!nextChapter}
                onClick={() => nextChapter && setReadingChapter(nextChapter)}
                aria-label="Next chapter"
              >
                Next <ChevronRight className="size-4" />
              </Button>
              <Button asChild size="sm">
                <a
                  href={downloadChapterHref(
                    readingChapter.id,
                    selectedManga.title,
                    readingChapter.chapter,
                  )}
                  download
                >
                  <Download className="size-3.5" /> Download
                </a>
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Close reader"
                onClick={() => setReadingChapter(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-6 sm:px-6">
            {pagesQuery.isLoading ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
                <Loader2 className="size-10 animate-spin text-cerulean" />
                <p className="text-sm text-muted-foreground">Loading chapter pages…</p>
              </div>
            ) : pagesQuery.isError || !pagesQuery.data?.length ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
                <p className="font-display text-lg font-semibold">
                  Chapter pages unavailable right now.
                </p>
                <Button asChild size="sm">
                  <a
                    href={downloadChapterHref(
                      readingChapter.id,
                      selectedManga.title,
                      readingChapter.chapter,
                    )}
                    download
                  >
                    <Download className="size-4" /> Try CBZ Download
                  </a>
                </Button>
              </div>
            ) : (
              <div className="mx-auto flex max-w-3xl flex-col gap-2">
                {pagesQuery.data.map((src, idx) => (
                  <img
                    key={src}
                    src={src}
                    alt={`Page ${idx + 1}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full rounded bg-surface object-contain"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
