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
});
