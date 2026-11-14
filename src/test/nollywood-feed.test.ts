import { describe, expect, it } from "vitest";
import { isFullMovieTitle, parseFeed } from "@/lib/catalog/nollywood-feed";

const entry = (id: string, title: string, href = `https://www.youtube.com/watch?v=${id}`) =>
  `<entry><yt:videoId>${id}</yt:videoId><title>${title}</title><link rel="alternate" href="${href}"/><published>2026-10-01T00:00:00+00:00</published><media:statistics views="42"/></entry>`;

describe("nollywood feed", () => {
  it("skips teasers and trailers", () => {
    expect(isFullMovieTitle("PAINS OF CHOOSING YOU 3&4 TEASER - 2026 Latest Nigerian Movie")).toBe(false);
    expect(isFullMovieTitle("WHERE LOVE LIVES COMING TO BIMBOADEMOYETV ON THE 23RD")).toBe(false);
  });
  it("keeps full movies, labels parts and drops shorts", () => {
    const xml = "<feed>" + entry("a1", "MY FATHER'S SECRET PT 2 - Kanayo 2026 Latest Nigerian Movie")
      + entry("b2", "SIBE (THE MOVIE) STARRING. BIMBO ADEMOYE")
      + entry("c3", "Quick movie skit", "https://www.youtube.com/shorts/c3") + "</feed>";
    const list = parseFeed(xml, "Test TV");
    expect(list.map((m) => m.youtubeId)).toEqual(["a1", "b2"]);
    expect(list[0]!.format).toBe("Part 2");
    expect(list[1]!.title).toBe("Sibe");
  });
});
