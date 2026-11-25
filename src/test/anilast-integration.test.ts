import { describe, expect, it } from "vitest";
import { buildAniLastEmbedUrl } from "@/lib/stream/anilast.functions";
import { handleAniLastProxyRequest, rewriteHlsPlaylist } from "@/lib/stream/anilast-proxy";
import { canStreamSource } from "@/lib/stream/resolver";

describe("AniLast anime integration", () => {
  it("rewrites AniLast proxy paths inside HLS playlists to local proxy routes", () => {
    const master = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=2300316,RESOLUTION=1920x1080",
      "/api/proxy/hls?url=https%3A%2F%2Fexample.com%2F1080.m3u8",
      "https://anilast.xyz/api/proxy/hls?url=https%3A%2F%2Fexample.com%2F720.m3u8",
    ].join("\n");

    const rewritten = rewriteHlsPlaylist(master);
    expect(rewritten).toContain("/api/anilast/hls?url=https%3A%2F%2Fexample.com%2F1080.m3u8");
    expect(rewritten).toContain("/api/anilast/hls?url=https%3A%2F%2Fexample.com%2F720.m3u8");
    expect(rewritten).not.toContain("/api/proxy/hls");
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

  it("builds sub and dub AniLast embed URLs and enables anime streaming/downloads", () => {
    expect(canStreamSource("anilist")).toBe(true);
    const subUrl = buildAniLastEmbedUrl({
      anilistId: "16498",
      malId: 16498,
      episode: 3,
      audio: "sub",
      title: "Attack on Titan",
    });
    const dubUrl = buildAniLastEmbedUrl({
      anilistId: "16498",
      malId: 16498,
      episode: 3,
      audio: "dub",
      title: "Attack on Titan",
    });
    expect(subUrl).toBe(
      "https://anilast.xyz/watch/16498/3?anilistId=16498&lang=sub&title=Attack+on+Titan",
    );
    expect(dubUrl).toBe(
      "https://anilast.xyz/watch/16498/3?anilistId=16498&lang=dub&title=Attack+on+Titan",
    );
  });
});
