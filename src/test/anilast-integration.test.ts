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
    expect(embeds.some((e) => e.url.includes("vidsrc.cc/v2/embed/anime/ani21/12/sub"))).toBe(true);
    expect(embeds.some((e) => e.url.includes("vidsrc.cc/v2/embed/anime/mal21/12/sub"))).toBe(true);
  });
});
