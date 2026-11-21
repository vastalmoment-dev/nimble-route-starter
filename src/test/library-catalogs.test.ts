import { describe, expect, it } from "vitest";
import { NOVELS, novelLinks } from "@/lib/books/novels";
import { NOLLYWOOD_MOVIES } from "@/lib/catalog/nollywood";
import { NOLLYWOOD_ARCHIVE } from "@/lib/catalog/nollywood-archive";
import { NOLLYWOOD_ADDITIONS } from "@/lib/catalog/nollywood-additions";

describe("Expanded libraries", () => {
  it("keeps one download entry per Gutenberg edition", () => {
    expect(new Set(NOVELS.map((book) => book.id)).size).toBe(NOVELS.length);
    for (const book of NOVELS) {
      expect(book.id).toBeGreaterThan(0);
      const url = new URL(novelLinks(book.id).epub);
      expect(url.hostname).toBe("www.gutenberg.org");
      expect(url.pathname).toBe(`/ebooks/${book.id}.epub3.images`);
    }
  });

  it("does not repeat existing movie uploads in the added collection", () => {
    const ids = [...NOLLYWOOD_MOVIES, ...NOLLYWOOD_ARCHIVE, ...NOLLYWOOD_ADDITIONS].map((movie) => movie.youtubeId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const movie of NOLLYWOOD_ADDITIONS) {
      expect(movie.youtubeId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(movie.channel === "Omoni Oboli TV" || movie.channel === "Ruth Kadiri 247").toBe(true);
    }
  });
});