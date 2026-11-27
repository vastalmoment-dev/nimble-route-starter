import { describe, expect, it, vi } from "vitest";
import { inferSectionFromMeta, mapCinemetaItem, parseCinemetaId } from "@/lib/catalog/cinemeta";
import { handleMediaProxyRequest, rewriteMediaPlaylist } from "@/lib/stream/media-proxy";
import { canStreamSource } from "@/lib/stream/resolver";

describe("Media streaming & live catalog helpers", () => {
  it("rewrites upstream HLS stream paths to local /api/media/hls and signed segment proxies", () => {
    const master = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1920x1080",
      "/_stream?id=abcDEF123456",
      "https://vidsrc.buzz/_stream?id=xyz987654321",
      "https://cdn.example.com/chunk-001.ts",
    ].join("\n");

    const rewritten = rewriteMediaPlaylist(master, "https://vidsrc.buzz/_stream?id=master");
    expect(rewritten).toContain("/api/media/hls?id=abcDEF123456");
    expect(rewritten).toContain("/api/media/hls?id=xyz987654321");
    expect(rewritten).toContain("/api/media/segment?token=");
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

  it("returns 502 JSON on upstream 403 or HTML challenge and strips cf-*/x-forwarded-* headers", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Forbidden", { status: 403 }))
      .mockResolvedValueOnce(
        new Response("<!DOCTYPE html><html><title>Just a moment...</title></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );

    try {
      const req1 = new Request("http://localhost:3000/api/media/hls?id=abcDEF123456", {
        headers: {
          "cf-connecting-ip": "1.2.3.4",
          "cf-ray": "abc123",
          "x-forwarded-for": "1.2.3.4",
        },
      });
      const res403 = await handleMediaProxyRequest(req1);
      expect(res403?.status).toBe(502);
      const body1 = (await res403?.json()) as {
        ok: boolean;
        upstreamStatus: number;
        blocked: boolean;
      };
      expect(body1.ok).toBe(false);
      expect(body1.upstreamStatus).toBe(403);
      expect(body1.blocked).toBe(true);

      const sentHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(sentHeaders["cf-connecting-ip"]).toBeUndefined();
      expect(sentHeaders["cf-ray"]).toBeUndefined();
      expect(sentHeaders["x-forwarded-for"]).toBeUndefined();
      expect(sentHeaders["Referer"]).toBe("https://vidsrc.buzz/");
      expect(sentHeaders["Accept-Language"]).toBeTruthy();

      const resChallenge = await handleMediaProxyRequest(
        new Request("http://localhost:3000/api/media/hls?id=abcDEF123456"),
      );
      expect(resChallenge?.status).toBe(502);
      const body2 = (await resChallenge?.json()) as { ok: boolean; blocked: boolean };
      expect(body2.ok).toBe(false);
      expect(body2.blocked).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("builds sandbox-safe embed list with bingeapi.st first and frembed.one first in French mode", async () => {
    const { buildMediaEmbedFallbacks } = await import("@/lib/stream/media.functions");
    const fallbacks = buildMediaEmbedFallbacks({
      mediaType: "tv",
      imdbId: "tt0944947",
      tmdbId: "1399",
      season: 2,
      episode: 5,
      lang: "en",
    });
    const labels = fallbacks.map((f) => f.label);
    expect(labels).toEqual([
      "bingeapi.st",
      "primesrc.me",
      "vidcore.io",
      "vidsrc.pm",
      "vidfast.pro",
      "vidsrc.su",
      "vidnest.fun",
      "vidlink.pro",
    ]);
    expect(labels).not.toContain("2embed");
    expect(labels).not.toContain("vidsrc.me");
    expect(labels).not.toContain("vidsrc.cc");
    expect(labels).not.toContain("vidsrc.xyz");
    expect(labels).not.toContain("embed.su");
    expect(fallbacks.find((f) => f.label === "bingeapi.st")?.url).toBe(
      "https://bingeapi.st/embed/tv/1399/2/5",
    );
    expect(fallbacks.find((f) => f.label === "primesrc.me")?.url).toBe(
      "https://primesrc.me/embed/tv?tmdb=1399&s=2&e=5",
    );
    expect(fallbacks.find((f) => f.label === "vidfast.pro")?.url).toBe(
      "https://vidfast.pro/tv/1399/2/5",
    );
    expect(fallbacks.find((f) => f.label === "vidsrc.su")?.url).toBe(
      "https://vidsrc.su/embed/tv/1399/2/5",
    );

    const frenchMovie = buildMediaEmbedFallbacks({
      mediaType: "movie",
      imdbId: "tt10364034",
      tmdbId: "496450",
      season: 1,
      episode: 1,
      lang: "fr",
    });
    expect(frenchMovie[0]).toEqual({
      label: "frembed.one · VF/VOSTFR",
      url: "https://frembed.one/api/film.php?id=496450",
    });
    expect(frenchMovie[1]).toEqual({
      label: "bingeapi.st",
      url: "https://bingeapi.st/embed/movie/496450",
    });

    const frenchSeries = buildMediaEmbedFallbacks({
      mediaType: "tv",
      imdbId: "tt2580046",
      tmdbId: "65334",
      season: 1,
      episode: 3,
      lang: "fr",
    });
    expect(frenchSeries[0]).toEqual({
      label: "frembed.one · VF/VOSTFR",
      url: "https://frembed.one/api/serie.php?id=65334&sa=1&epi=3",
    });
    expect(frenchSeries[1]?.label).toBe("bingeapi.st");

    const imdbOnly = buildMediaEmbedFallbacks({
      mediaType: "movie",
      imdbId: "tt24083908",
      season: 1,
      episode: 1,
    });
    expect(imdbOnly[0]?.url).toBe("https://bingeapi.st/embed/movie/tt24083908");
    expect(imdbOnly[1]?.url).toBe("https://primesrc.me/embed/movie?imdb=tt24083908");

    const imdbOnlyTv = buildMediaEmbedFallbacks({
      mediaType: "tv",
      imdbId: "tt10919420",
      season: 1,
      episode: 1,
    });
    expect(imdbOnlyTv[0]?.label).toBe("bingeapi.st");
    expect(imdbOnlyTv[1]?.label).toBe("primesrc.me");
  });

  it("proxies signed subtitle URLs and converts SRT timestamps into WEBVTT", async () => {
    const { signSubtitleProxyUrl } = await import("@/lib/stream/media-proxy");
    const signedPath = signSubtitleProxyUrl("https://subs.example.com/aot-ep1-fr.srt");
    expect(signedPath).toMatch(/^\/api\/media\/sub\?token=/);

    const srtSample = "1\r\n00:00:01,500 --> 00:00:04,250\r\nBonjour tout le monde!\r\n";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(srtSample, { status: 200 }));

    try {
      const res = await handleMediaProxyRequest(new Request(`http://localhost:3000${signedPath}`));
      expect(res?.status).toBe(200);
      expect(res?.headers.get("content-type")).toContain("text/vtt");
      const vtt = await res?.text();
      expect(vtt).toMatch(/^WEBVTT\n\n/);
      expect(vtt).toContain("00:00:01.500 --> 00:00:04.250");
      expect(vtt).toContain("Bonjour tout le monde!");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
