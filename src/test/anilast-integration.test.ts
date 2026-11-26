import { describe, expect, it } from "vitest";
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
});
