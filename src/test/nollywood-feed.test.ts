import { describe, expect, it } from "vitest";
import { inferSectionFromMeta, mapCinemetaItem, type CinemetaMeta } from "@/lib/catalog/cinemeta";
import { SECTION_META } from "@/lib/catalog/types";

describe("Nollywood catalog classification (non-YouTube multi-provider)", () => {
  it("registers nollywood in SECTION_META without YouTube embedding copy", () => {
    expect(SECTION_META.nollywood.label).toBe("Nollywood");
    expect(SECTION_META.nollywood.tagline.toLowerCase()).not.toContain("youtube");
  });

  it("classifies Nigerian, Yoruba and Igbo films into nollywood automatically", () => {
    const nigerianFilm: CinemetaMeta = {
      id: "tt24083908",
      imdb_id: "tt24083908",
      type: "movie",
      name: "The Black Book",
      country: "Nigeria",
      language: "English, Yoruba",
      genres: ["Crime", "Drama", "Thriller"],
      year: 2023,
    };

    const yorubaEpic: CinemetaMeta = {
      id: "tt28546464",
      imdb_id: "tt28546464",
      type: "movie",
      name: "Jagun Jagun",
      language: "Yoruba",
      genres: ["Action", "Drama"],
      year: 2023,
    };

    expect(inferSectionFromMeta(nigerianFilm)).toBe("nollywood");
    expect(inferSectionFromMeta(yorubaEpic)).toBe("nollywood");

    const mapped = mapCinemetaItem(nigerianFilm);
    expect(mapped?.section).toBe("nollywood");
    expect(mapped?.source).toBe("cinemeta");
    expect(mapped?.imdbId).toBe("tt24083908");
  });
});
