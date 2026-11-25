import { describe, expect, it } from "vitest";
import { inferSectionFromMeta, mapCinemetaItem, parseCinemetaId } from "@/lib/catalog/cinemeta";
import { handleMediaProxyRequest, rewriteMediaPlaylist } from "@/lib/stream/media-proxy";
import { canStreamSource } from "@/lib/stream/resolver";

describe("Media streaming & live catalog helpers", () => {
  it("rewrites upstream HLS stream paths to local /api/media/hls proxy", () => {
    const master = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080",
      "/_stream?id=abcDEF123456",
      "https://vidsrc.buzz/_stream?id=xyz987654321",
    ].join("\n");

    const rewritten = rewriteMediaPlaylist(master);
    expect(rewritten).toContain("/api/media/hls?id=abcDEF123456");
    expect(rewritten).toContain("/api/media/hls?id=xyz987654321");
    expect(rewritten).not.toContain("vidsrc.buzz");
  });

  it("validates proxy methods, IDs, and subtitle refs safely", async () => {
    const ignored = await handleMediaProxyRequest(new Request("http://localhost:3000/cartoons"));
    expect(ignored).toBeNull();

    const wrongMethod = await handleMediaProxyRequest(
      new Request("http://localhost:3000/api/media/hls?id=abcDEF123456", { method: "POST" }),
    );
    expect(wrongMethod?.status).toBe(405);

    const invalidId = await handleMediaProxyRequest(
      new Request("http://localhost:3000/api/media/hls?id=../etc/passwd"),
    );
    expect(invalidId?.status).toBe(400);

    const shortId = await handleMediaProxyRequest(
      new Request("http://localhost:3000/api/media/hls?id=abc"),
    );
    expect(shortId?.status).toBe(400);

    const invalidSub = await handleMediaProxyRequest(
      new Request("http://localhost:3000/api/media/sub?ref=http://127.0.0.1/bad"),
    );
    expect(invalidSub?.status).toBe(400);
  });

  it("enables native streaming and downloads for anime, cartoons, and movies", () => {
    expect(canStreamSource("anilist")).toBe(true);
    expect(canStreamSource("cinemeta")).toBe(true);
    expect(canStreamSource("tmdb")).toBe(true);
    expect(canStreamSource("tvmaze")).toBe(true);
  });

  it("parses Cinemeta IDs and routes Bad Guys, Boss Baby, TMNT, Bollywood, Tollywood, and K-Dramas", () => {
    expect(parseCinemetaId("movie-tt8115900")).toEqual({ type: "movie", imdbId: "tt8115900" });
    expect(parseCinemetaId("series-tt7741824")).toEqual({ type: "series", imdbId: "tt7741824" });
    expect(parseCinemetaId("bad-id")).toBeNull();

    const badGuys = mapCinemetaItem({
      id: "tt8115900",
      type: "movie",
      name: "The Bad Guys",
      genres: ["Animation", "Comedy"],
    });
    expect(badGuys?.section).toBe("cartoons");
    expect(badGuys?.mediaType).toBe("movie");

    const bossBaby = mapCinemetaItem({
      id: "tt7741824",
      type: "series",
      name: "The Boss Baby: Back in Business",
      genres: ["Animation", "Family"],
    });
    expect(bossBaby?.section).toBe("cartoons");
    expect(bossBaby?.mediaType).toBe("tv");

    const tmnt = mapCinemetaItem({
      id: "tt0131613",
      type: "series",
      name: "Teenage Mutant Ninja Turtles",
      genres: ["Animation", "Action"],
    });
    expect(tmnt?.section).toBe("cartoons");

    expect(
      inferSectionFromMeta({
        id: "tt8178634",
        type: "movie",
        name: "RRR",
        language: "Telugu",
        country: "India",
        genres: ["Action"],
      }),
    ).toBe("tollywood");

    expect(
      inferSectionFromMeta({
        id: "tt15354916",
        type: "movie",
        name: "Jawan",
        language: "Hindi",
        country: "India",
        genres: ["Action"],
      }),
    ).toBe("bollywood");

    expect(
      inferSectionFromMeta({
        id: "tt10919420",
        type: "series",
        name: "Squid Game",
        country: "South Korea",
        genres: ["Drama"],
      }),
    ).toBe("k-dramas");
  });
});
