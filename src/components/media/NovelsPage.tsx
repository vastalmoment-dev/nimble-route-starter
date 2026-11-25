import { BookOpen, Download, ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NOVELS, NOVEL_GENRES, novelLinks } from "@/lib/books/novels";

export function NovelsPage() {
  const [genre, setGenre] = useState<(typeof NOVEL_GENRES)[number]>("All");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return NOVELS.filter(
      (n) =>
        (genre === "All" || n.genre === genre) &&
        (!term || `${n.title} ${n.author}`.toLowerCase().includes(term)),
    );
  }, [genre, q]);

  return (
    <div className="px-4 pt-24 sm:px-8 lg:px-12">
      <header className="mb-8 border-b border-border pb-6">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cerulean">
          <BookOpen className="size-4" /> Free library
        </p>
        <h1 className="font-display text-3xl font-bold !tracking-normal sm:text-4xl">Novels</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Timeless stories you can download free and keep forever. Every book here is in the public
          domain.
        </p>
      </header>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {NOVEL_GENRES.map((g) => (
            <Button
              key={g}
              size="sm"
              variant={genre === g ? "default" : "secondary"}
              className="rounded-full"
              aria-pressed={genre === g}
              onClick={() => setGenre(g)}
            >
              {g}
            </Button>
          ))}
        </div>
        <label className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or author"
            aria-label="Search novels"
            className="pl-9"
          />
        </label>
      </div>
      {list.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No novels match that search.
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {list.map((n) => {
          const links = novelLinks(n.id);
          return (
            <article
              key={n.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
            >
              <div className="aspect-[2/3] overflow-hidden bg-scrim">
                <img
                  src={links.cover}
                  alt={`${n.title} cover`}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="text-xs font-medium text-cerulean">{n.genre}</p>
                <h2 className="font-bold leading-snug">{n.title}</h2>
                <p className="text-xs text-muted-foreground">{n.author}</p>
                <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {n.synopsis}
                </p>
                <div className="mt-auto flex flex-col gap-2 pt-2">
                  <Button asChild size="sm">
                    <a
                      href={links.epub}
                      rel="noopener"
                      aria-label={`Download ${n.title} free (EPUB)`}
                    >
                      <Download /> Free download
                    </a>
                  </Button>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="secondary" className="flex-1">
                      <a href={links.read} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> Read
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="flex-1">
                      <a href={links.kindle} rel="noopener">
                        Kindle
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
        Books provided free by Project Gutenberg · Public domain in the United States.
      </p>
    </div>
  );
}
