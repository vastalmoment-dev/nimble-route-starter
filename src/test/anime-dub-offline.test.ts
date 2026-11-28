import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dedupeSearchAnimePriority,
  isAnimeItem,
  resolveAniListIdForItem,
} from "@/lib/catalog/anime-bridge";
import type { MediaItem } from "@/lib/catalog/types";
import { downloadStream } from "@/lib/download/downloader";
import { offlineLibrary } from "@/lib/download/offline-db";
import { handleAniLastProxyRequest } from "@/lib/stream/anilast-proxy";
import { resolveAnimeStream } from "@/lib/stream/anilast.functions";
import { extractDirectStreamsFromEmbeds, resolveVostfreeEmbeds } from "@/lib/stream/anime-fr";
import { filterAvailableEmbeds } from "@/lib/stream/embed-probe";

function makeItem(overrides: Partial<MediaItem>): MediaItem {
  return {
    key: `${overrides.source ?? "cinemeta"}:${overrides.id ?? "1"}`,
    id: "1",
    source: "cinemeta",
    section: "hollywood",
    title: "Test Title",
    poster: null,
    posterHd: null,
    backdrop: null,
    year: 2020,
    genres: [],
    description: "",
    ...overrides,
  };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

describe("Anime bridge, dub parity, French backup providers, and offline storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prioritizes canonical AniList entries in search results and identifies anime across sources", async () => {
    const blackCloverAnilist = makeItem({
      key: "anilist:97940",
      id: "97940",
      source: "anilist",
      section: "anime",
      title: "Black Clover",
      englishTitle: "Black Clover",
    });
    const blackCloverCinemeta = makeItem({
      key: "cinemeta:series-tt7441658",
      id: "series-tt7441658",
      source: "cinemeta",
      section: "hollywood",
      title: "Black Clover",
      imdbId: "tt7441658",
      genres: ["Animation", "Action", "Adventure"],
      mediaType: "tv",
    });
    const blackCloverTvmaze = makeItem({
      key: "tvmaze:31467",
      id: "31467",
      source: "tvmaze",
      section: "hollywood",
      title: "Black Clover",
      language: "Japanese",
      genres: ["Animation", "Anime", "Fantasy"],
      mediaType: "tv",
    });
    const movieHomonym = makeItem({
      key: "tmdb:movie-99",
      id: "movie-99",
      source: "tmdb",
      section: "hollywood",
      title: "Inception",
    });

    expect(isAnimeItem(blackCloverCinemeta)).toBe(false);
    expect(isAnimeItem(blackCloverTvmaze)).toBe(true);
    expect(isAnimeItem(blackCloverAnilist)).toBe(true);

    const deduped = dedupeSearchAnimePriority([
      blackCloverAnilist,
      blackCloverCinemeta,
      blackCloverTvmaze,
      movieHomonym,
    ]);
    expect(deduped.map((i) => i.key)).toEqual(["anilist:97940", "tmdb:movie-99"]);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ mappings: { anilist_id: 97940 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const bridgedId = await resolveAniListIdForItem({
      source: "cinemeta",
      id: "series-tt7441658",
      title: "Black Clover",
      imdbId: "tt7441658",
    });
    expect(bridgedId).toBe("97940");
    expect(fetchSpy.mock.calls[0]?.[0]).toContain("api.ani.zip/mappings?imdb_id=tt7441658");
  });

  it("filters out HTTP 200 restricted, deleted, and 410 embed shells", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes("restricted.example")) {
        return new Response(
          "<html><body>Video is restricted on this domain</body></html>".padEnd(200, " "),
          {
            status: 200,
          },
        );
      }
      if (url.includes("gone.example")) {
        return new Response(
          "<html><body><div>Error Code: <span>410</span></div></body></html>".padEnd(200, " "),
          {
            status: 200,
          },
        );
      }
      if (url.includes("deleted-fr.example")) {
        return new Response(
          "<html><body><p>Désolé, cette vidéo n'est plus disponible.</p></body></html>".padEnd(
            200,
            " ",
          ),
          { status: 200 },
        );
      }
      return new Response(
        "<html><body><div id='player'>Stream Ready</div></body></html>".padEnd(220, " "),
        {
          status: 200,
        },
      );
    });

    const kept = await filterAvailableEmbeds([
      { label: "Restricted", url: "https://restricted.example/e/1" },
      { label: "Error410", url: "https://gone.example/e/2" },
      { label: "DeletedFR", url: "https://deleted-fr.example/e/3" },
      { label: "Healthy", url: "https://healthy.example/e/4" },
    ]);

    expect(kept.map((k) => k.label)).toEqual(["Healthy"]);
    expect(kept[0]?.available).toBe(true);
  });

  it("resolves ipv4.vostfree.ws VF embeds (skipping myvi) and extracts downloadable streams from embeds", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url === "https://ipv4.vostfree.ws/") {
        return new Response(
          `<div>
            <a href="https://ipv4.vostfree.ws/1200-black-clover-vf.html">Black Clover VF</a>
            <a href="https://ipv4.vostfree.ws/1201-black-clover-vostfr.html">Black Clover VOSTFR</a>
          </div>`,
          { status: 200 },
        );
      }
      if (url === "https://ipv4.vostfree.ws/1200-black-clover-vf.html") {
        return new Response(
          `<html>
            <select><option value="buttons_1">Episode 01</option></select>
            <div id="buttons_1">
              <div id="player_1" class="new_player_uqload">Uqload</div>
              <div id="player_2" class="new_player_myvi">MyVi</div>
              <div id="player_3" class="new_player_ok">OkRu</div>
            </div>
            <div id="content_player_1">abc123uq</div>
            <div id="content_player_2">legacy_myvi</div>
            <div id="content_player_3">99887766</div>
          </html>`,
          { status: 200 },
        );
      }
      if (url.includes("uqload.vc/embed-abc123uq.html")) {
        return new Response(
          `<html><script>var src = "https://cdn.example.net/v/black-clover-vf.mp4";</script></html>`.padEnd(
            220,
            " ",
          ),
          { status: 200 },
        );
      }
      if (url.includes("ok.ru/videoembed/99887766")) {
        return new Response(
          `<html><body><div id="ok-player">Ready</div></body></html>`.padEnd(220, " "),
          {
            status: 200,
          },
        );
      }
      if (url === "https://cdn.example.net/v/black-clover-vf.mp4") {
        return new Response(null, {
          status: 200,
          headers: { "content-type": "video/mp4" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const vfEmbeds = await resolveVostfreeEmbeds({
      titles: ["Black Clover"],
      episode: 1,
      variant: "vf",
    });
    expect(vfEmbeds.map((e) => e.url)).toEqual([
      "https://www.ok.ru/videoembed/99887766",
      "https://uqload.vc/embed-abc123uq.html",
    ]);

    const extracted = await extractDirectStreamsFromEmbeds(vfEmbeds, {
      langLabel: "VF",
      streamLang: "fr",
    });
    expect(extracted).toHaveLength(1);
    expect(extracted[0]?.type).toBe("mp4");
    expect(extracted[0]?.url).toContain("/api/media/segment?token=");
    expect(extracted[0]?.lang).toBe("fr");
  });

  it("proxies /api/anilast/stream MP4 requests with Range headers pinned to anilast.xyz", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-range": "bytes 0-3/1000",
          "accept-ranges": "bytes",
        },
      }),
    );

    const res = await handleAniLastProxyRequest(
      new Request(
        "http://localhost:3000/api/anilast/stream?url=https%3A%2F%2Fcdn.example.com%2Fep1.mp4",
        {
          headers: { Range: "bytes=0-3" },
        },
      ),
    );

    expect(res?.status).toBe(206);
    expect(res?.headers.get("content-type")).toBe("video/mp4");
    expect(res?.headers.get("content-range")).toBe("bytes 0-3/1000");
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://anilast.xyz/api/proxy/stream?url=https%3A%2F%2Fcdn.example.com%2Fep1.mp4",
    );
    const headers = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["Range"]).toBe("bytes=0-3");
    expect(headers["Referer"]).toBe("https://anilast.xyz/");
  });

  it("discards silent dub-to-sub duplicates on anilast and extracts playable dub stream from embed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes("api.ani.zip") || url.includes("arm.haglund.dev")) {
        return new Response(JSON.stringify({ mappings: { mal_id: 34572 } }), { status: 200 });
      }
      // AniLast returns the EXACT same Japanese URL for both lang=dub and lang=sub
      if (url.includes("anilast.xyz/api/anime/stream/")) {
        return new Response(
          JSON.stringify({
            provider: "mirror",
            type: "hls",
            url: "/api/proxy/hls?url=https%3A%2F%2Fcdn.example.com%2Fshared-ep1.m3u8",
          }),
          { status: 200 },
        );
      }
      if (url.startsWith("https://vidlink.pro/anime/97940/1/dub")) {
        return new Response(
          `<html><script>const src = "https://cdn.example.net/dub/ep1/master.m3u8";</script></html>`.padEnd(
            220,
            " ",
          ),
          { status: 200 },
        );
      }
      if (url === "https://cdn.example.net/dub/ep1/master.m3u8") {
        return new Response("#EXTM3U\n#EXT-X-TARGETDURATION:10\n", { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    });

    const result = await resolveAnimeStream({
      anilistId: "97940",
      malId: 34572,
      episode: 1,
      audio: "dub",
      lang: "en",
      title: "Black Clover",
    });

    expect(result.ok).toBe(true);
    expect(result.streamUrl).toContain("/api/media/segment?token=");
    expect(result.streamUrl).not.toContain("shared-ep1.m3u8");
    expect(result.embedFallbacks?.some((e) => e.url.includes("/dub"))).toBe(true);
  });

  it("builds stable offline IDs, degrades safely without IndexedDB, and returns Blob + VTT from downloadStream", async () => {
    const idEn = offlineLibrary.buildId({
      source: "anilist",
      id: "97940",
      season: 1,
      episode: 1,
      audio: "dub",
      lang: "en",
    });
    const idFr = offlineLibrary.buildId({
      source: "anilist",
      id: "97940",
      season: 1,
      episode: 1,
      audio: "dub",
      lang: "fr",
    });
    expect(idEn).toBe("anilist:97940:s1:e1:dub:en");
    expect(idEn).not.toBe(idFr);
    expect(await offlineLibrary.list()).toEqual([]);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url === "https://cdn.example.net/video.mp4") {
        return new Response(new Uint8Array([0, 1, 2, 3, 4, 5]), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        });
      }
      if (url === "https://cdn.example.net/subs-fr.vtt") {
        return new Response("WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nBonjour\n", { status: 200 });
      }
      return new Response("", { status: 404 });
    });

    const downloaded = await downloadStream(
      {
        url: "https://cdn.example.net/video.mp4",
        type: "mp4",
        provider: "SHADOW Stream",
        isDemo: false,
        subtitles: [{ url: "https://cdn.example.net/subs-fr.vtt", lang: "fr", label: "Français" }],
      },
      {
        filename: "Black_Clover_E1_SUB",
        includeSubtitles: true,
        lang: "fr",
        skipSaveFile: true,
      },
    );

    expect(downloaded.ext).toBe("mp4");
    expect(downloaded.mimeType).toBe("video/mp4");
    expect(downloaded.blob.size).toBe(6);
    expect(downloaded.subtitleVtt).toContain("Bonjour");
  });
});
