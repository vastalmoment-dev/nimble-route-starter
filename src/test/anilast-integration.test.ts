import { describe, expect, it, vi } from "vitest";
import { handleAniLastProxyRequest, rewriteHlsPlaylist } from "@/lib/stream/anilast-proxy";
import { canStreamSource } from "@/lib/stream/resolver";

describe("AniLast anime integration", () => {
  it("rewrites AniLast proxy paths and external segment URIs inside HLS playlists to local proxy routes", () => {
    const master = [
      "#EXTM3U",
      '#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.com/key.bin"',
      "#EXT-X-STREAM-INF:BANDWIDTH=2300316,RESOLUTION=1920x1080",
      "/api/proxy/hls?url=https%3A%2F%2Fexample.com%2F1080.m3u8",
      "https://anilast.xyz/api/proxy/hls?url=https%3A%2F%2Fexample.com%2F720.m3u8",
      "seg-001.ts",
    ].join("\n");

    const rewritten = rewriteHlsPlaylist(master, "https://cdn.example.com/hls/master.m3u8");
    expect(rewritten).toContain("/api/anilast/hls?url=https%3A%2F%2Fexample.com%2F1080.m3u8");
    expect(rewritten).toContain("/api/anilast/hls?url=https%3A%2F%2Fexample.com%2F720.m3u8");
    expect(rewritten).toContain("/api/media/segment?token=");
    expect(rewritten).not.toContain("/api/proxy/hls");
    expect(rewritten).not.toContain("https://cdn.example.com/key.bin");
  });

  it("validates proxy paths and target URLs safely", async () => {
    const ignored = await handleAniLastProxyRequest(new Request("http://localhost:3000/anime"));
    expect(ignored).toBeNull();

    const wrongMethod = await handleAniLastProxyRequest(
      new Request("http://localhost:3000/api/anilast/hls?url=https://example.com/a.m3u8", {
        method: "POST",
      }),
    );
    expect(wrongMethod?.status).toBe(405);

    const invalidScheme = await handleAniLastProxyRequest(
      new Request("http://localhost:3000/api/anilast/hls?url=javascript:alert(1)"),
    );
    expect(invalidScheme?.status).toBe(400);

    const missingTarget = await handleAniLastProxyRequest(
      new Request("http://localhost:3000/api/anilast/subtitle"),
    );
    expect(missingTarget?.status).toBe(400);
  });

  it("enables native anime streaming/downloads without exposing anilast embed URLs", async () => {
    expect(canStreamSource("anilist")).toBe(true);
    const mod = await import("@/lib/stream/anilast.functions");
    expect("buildAniLastEmbedUrl" in mod).toBe(false);
  });

  it("validates image proxy parameters and restricts image hostnames", async () => {
    const missingParams = await handleAniLastProxyRequest(
      new Request("http://localhost:3000/api/anilast/image"),
    );
    expect(missingParams?.status).toBe(400);

    const disallowedHost = await handleAniLastProxyRequest(
      new Request("http://localhost:3000/api/anilast/image?url=https://127.0.0.1/secret.png"),
    );
    expect(disallowedHost?.status).toBe(400);

    const nonNumericId = await handleAniLastProxyRequest(
      new Request("http://localhost:3000/api/anilast/image?id=../etc/passwd"),
    );
    expect(nonNumericId?.status).toBe(400);
  });

  it("returns 502 JSON when upstream returns 503/HTML and builds anime embed fallbacks with AniList/MAL IDs", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }));

    try {
      const res = await handleAniLastProxyRequest(
        new Request(
          "http://localhost:3000/api/anilast/hls?url=https%3A%2F%2Fexample.com%2Fep1.m3u8",
          {
            headers: { "cf-ray": "ray-xyz", "x-forwarded-for": "1.2.3.4" },
          },
        ),
      );
      expect(res?.status).toBe(502);
      const json = (await res?.json()) as {
        ok: boolean;
        upstreamStatus: number;
        blocked: boolean;
      };
      expect(json.ok).toBe(false);
      expect(json.upstreamStatus).toBe(503);
      expect(json.blocked).toBe(true);

      const sentHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>;
      expect(sentHeaders["cf-ray"]).toBeUndefined();
      expect(sentHeaders["x-forwarded-for"]).toBeUndefined();
      expect(sentHeaders["Referer"]).toBe("https://anilast.xyz/");
      expect(sentHeaders["Origin"]).toBe("https://anilast.xyz");
    } finally {
      fetchSpy.mockRestore();
    }

    const { buildAnimeEmbedFallbacks } = await import("@/lib/stream/anilast.functions");
    const embeds = buildAnimeEmbedFallbacks({
      anilistId: "21",
      malId: 21,
      episode: 12,
      audio: "sub",
    });
    const urls = embeds.map((e) => e.url);
    expect(urls).toContain("https://vidlink.pro/anime/21/12/sub");
    expect(urls).toContain("https://vidnest.fun/anime/21/12/sub");
    expect(urls).toContain("https://vidsrc.su/embed/anime/21/12/sub");
    expect(urls).toContain("https://megaplay.buzz/stream/mal/21/12/sub");
    expect(urls).toContain("https://vidcore.io/embed/anime/21/12");
    expect(urls.some((u) => u.includes("vidsrc.cc") || u.includes("vidsrc.icu"))).toBe(false);

    const dubEmbeds = buildAnimeEmbedFallbacks({
      anilistId: "21",
      malId: 21,
      episode: 12,
      audio: "dub",
    });
    expect(dubEmbeds.find((e) => e.label === "vidcore.io")?.url).toBe(
      "https://vidcore.io/embed/anime/21/12?dub=true",
    );
  });

  it("filters out 404, X-Frame-Options blocked, Cloudflare-challenged, and sandbox-blocked embed servers", async () => {
    const { filterAvailableEmbeds } = await import("@/lib/stream/embed-probe");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(`<html><body>${"x".repeat(200)}</body></html>`, {
          status: 200,
          headers: { "x-frame-options": "SAMEORIGIN" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          `<html><title>Just a moment...</title><body>${"x".repeat(200)}</body></html>`,
          {
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          `<html><body><h4>Sandbox not allowed</h4><p>Remove sandbox from the iframe to play.</p>${"x".repeat(120)}</body></html>`,
          {
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(`<html><title>Player</title><body>${"x".repeat(200)}</body></html>`, {
          status: 200,
        }),
      );

    try {
      const filtered = await filterAvailableEmbeds([
        { label: "dead", url: "https://dead.example/embed/1" },
        { label: "blocked-xfo", url: "https://xfo.example/embed/1" },
        { label: "cf-challenge", url: "https://cf.example/embed/1" },
        { label: "sandbox-blocked", url: "https://sbx.example/embed/1" },
        { label: "healthy", url: "https://healthy.example/embed/1" },
      ]);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toEqual({
        label: "healthy",
        url: "https://healthy.example/embed/1",
        available: true,
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("routes French anime DUB (VF) via anime-sama instead of English dub and detects seasons cleanly", async () => {
    const { detectAnimeSeasonFromTitles, resolveAnimeSamaEmbeds } =
      await import("@/lib/stream/anime-fr");
    expect(detectAnimeSeasonFromTitles(["Attack on Titan Season 3"])).toBe(3);
    expect(detectAnimeSeasonFromTitles(["Jujutsu Kaisen 2nd Season"])).toBe(2);
    expect(detectAnimeSeasonFromTitles(["Demon Slayer"])).toBe(1);

    const catalogSearchHtml = `<a href="https://anime-sama.to/catalogue/naruto-shippuden/"><h3>Naruto Shippuden</h3></a>`;
    const catalogPageHtml = `<script>panneauAnime("Saison 1", "saison1/vostfr");</script>`;
    const episodePageHtml = `
      <script>
        var epsJeton = "tok_abc";
        var eps1 = ["lien:101", "lien:102"];
        var eps2 = ["lien:201", "lien:202"];
      </script>
    `;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/template-php/defaut/fetch.php")) {
        return new Response(catalogSearchHtml, { status: 200 });
      }
      if (url === "https://anime-sama.to/catalogue/naruto-shippuden/") {
        return new Response(catalogPageHtml, { status: 200 });
      }
      if (url === "https://anime-sama.to/catalogue/naruto-shippuden/saison1/vf/") {
        return new Response(episodePageHtml, { status: 200 });
      }
      if (url.includes("/api/lien.php?j=tok_abc&l=102")) {
        return new Response(JSON.stringify({ u: "https://ansembed.net/e/vf102" }), {
          status: 200,
        });
      }
      if (url.includes("/api/lien.php?j=tok_abc&l=202")) {
        return new Response(JSON.stringify({ u: "https://deadmirror.example/e/vf202" }), {
          status: 200,
        });
      }
      if (url === "https://ansembed.net/e/vf102") {
        return new Response(
          `<html><title>VF Player</title><body>${"x".repeat(200)}</body></html>`,
          {
            status: 200,
          },
        );
      }
      if (url === "https://deadmirror.example/e/vf202") {
        return new Response("Not Found", { status: 404 });
      }
      return new Response("Unexpected", { status: 404 });
    });

    try {
      const vfEmbeds = await resolveAnimeSamaEmbeds({
        titles: ["Naruto: Shippuden"],
        episode: 2,
        variant: "vf",
      });
      expect(vfEmbeds).toEqual([
        {
          label: "VF · Lecteur 1",
          url: "https://ansembed.net/e/vf102",
          available: true,
        },
      ]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("falls back to English DUB + French subtitles when FR VF is unavailable, and ensures EN subs in EN SUB mode", async () => {
    const { resolveAnimeStream } = await import("@/lib/stream/anilast.functions");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("graphql.anilist.co")) {
        return new Response(
          JSON.stringify({
            data: {
              Media: {
                idMal: 555,
                format: "TV",
                title: { english: "Sample Anime", romaji: "Sample Anime", native: "Sample" },
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("api.ani.zip/mappings")) {
        return new Response(JSON.stringify({ mappings: { imdb_id: "tt1234567" } }), {
          status: 200,
        });
      }
      if (url.includes("anime-sama.to")) {
        return new Response("Not Found", { status: 404 });
      }
      if (url.includes("/api/anime/stream/")) {
        return new Response(
          JSON.stringify({
            url: "/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fdub%2Fmaster.m3u8",
            type: "hls",
            subtitles: [],
          }),
          { status: 200 },
        );
      }
      if (url.includes("opensubtitles-v3.strem.io")) {
        return new Response(
          JSON.stringify({
            subtitles: [
              { url: "https://subs.example.com/fr.srt", lang: "fre", label: "French" },
              { url: "https://subs.example.com/en-backup.srt", lang: "eng", label: "English" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    try {
      const frFallback = await resolveAnimeStream({
        anilistId: "99991",
        malId: 555,
        episode: 1,
        audio: "dub",
        lang: "fr",
        title: "Sample Anime",
      });
      expect(frFallback.ok).toBe(true);
      expect(frFallback.isFrenchAudio).toBe(false);
      expect(frFallback.dubFallbackToEnglish).toBe(true);
      expect(frFallback.hasFrenchSubtitles).toBe(true);
      expect(frFallback.subtitles[0]?.lang.toLowerCase()).toMatch(/fr/);

      const enSub = await resolveAnimeStream({
        anilistId: "99991",
        malId: 555,
        episode: 1,
        audio: "sub",
        lang: "en",
        title: "Sample Anime",
      });
      expect(enSub.ok).toBe(true);
      expect(enSub.subtitles.some((s) => /^(en|eng)\b/i.test(s.lang))).toBe(true);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("streams disguised MPEG-TS segments (.html/.css/.js and 252-byte PNG prefixed) as video/mp2t while blocking real HTML challenges", async () => {
    const { handleMediaProxyRequest, signMediaProxyUrl } = await import("@/lib/stream/media-proxy");

    const tsBytes = new Uint8Array(600);
    tsBytes[0] = 0x47;
    tsBytes[1] = 0x40;
    tsBytes[2] = 0x00;
    tsBytes[3] = 0x11;

    const pngPrefixed = new Uint8Array(600);
    pngPrefixed[0] = 0x89;
    pngPrefixed[1] = 0x50;
    pngPrefixed[2] = 0x4e;
    pngPrefixed[3] = 0x47;
    pngPrefixed[252] = 0x47;
    pngPrefixed[253] = 0x40;

    const segHtmlUrl = signMediaProxyUrl(
      "https://shadowcdn.lol/hls/seg-2.html",
      "https://megaplay.buzz/",
    );
    const segPngUrl = signMediaProxyUrl(
      "https://cdn.example.net/seg-3.png",
      "https://megaplay.buzz/",
    );
    const segChallengeUrl = signMediaProxyUrl(
      "https://shadowcdn.lol/hls/seg-4.html",
      "https://megaplay.buzz/",
    );

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(tsBytes, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(pngPrefixed, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("<!DOCTYPE html><html><title>Just a moment...</title></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );

    try {
      const resHtmlTs = await handleMediaProxyRequest(
        new Request(`http://localhost:3000${segHtmlUrl}`),
      );
      expect(resHtmlTs?.status).toBe(200);
      expect(resHtmlTs?.headers.get("content-type")).toBe("video/mp2t");
      const outHtmlTs = new Uint8Array(await resHtmlTs!.arrayBuffer());
      expect(outHtmlTs.byteLength).toBe(600);
      expect(outHtmlTs[0]).toBe(0x47);

      const resPngStripped = await handleMediaProxyRequest(
        new Request(`http://localhost:3000${segPngUrl}`),
      );
      expect(resPngStripped?.status).toBe(200);
      expect(resPngStripped?.headers.get("content-type")).toBe("video/mp2t");
      const outStripped = new Uint8Array(await resPngStripped!.arrayBuffer());
      expect(outStripped.byteLength).toBe(600 - 252);
      expect(outStripped[0]).toBe(0x47);

      const resChallenge = await handleMediaProxyRequest(
        new Request(`http://localhost:3000${segChallengeUrl}`),
      );
      expect(resChallenge?.status).toBe(502);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("proxies disguised /api/anilast/hls binary segments (.jpg/.js/.html) without corrupting binary payloads and probes MegaPlay with anilast Referer", async () => {
    const rawTs = new Uint8Array([0x47, 0x40, 0x00, 0x10, 0xff, 0xfe]);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(rawTs, {
          status: 200,
          headers: { "content-type": "application/javascript" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(`<html><title>Player</title><body>${"x".repeat(200)}</body></html>`, {
          status: 200,
        }),
      );

    try {
      const segRes = await handleAniLastProxyRequest(
        new Request(
          "http://localhost:3000/api/anilast/hls?url=https%3A%2F%2Fcdn.example.com%2Fseg-1.js",
        ),
      );
      expect(segRes?.status).toBe(200);
      expect(segRes?.headers.get("content-type")).toBe("video/mp2t");
      const bytes = new Uint8Array(await segRes!.arrayBuffer());
      expect(Array.from(bytes)).toEqual(Array.from(rawTs));

      const { probeSingleEmbed } = await import("@/lib/stream/embed-probe");
      const ok = await probeSingleEmbed("https://megaplay.buzz/stream/mal/34572/3/sub");
      expect(ok).toBe(true);
      const sentHeaders = fetchSpy.mock.calls[1]?.[1]?.headers as Record<string, string>;
      expect(sentHeaders["Referer"]).toBe("https://anilast.xyz/");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
