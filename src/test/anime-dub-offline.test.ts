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

  it("ignores api.ani.zip OVA title mismatches (tt7441658 -> Jump Festa 2016 Special) and falls back to AniList TV search", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes("api.ani.zip/mappings?imdb_id=tt7441658")) {
        return new Response(
          JSON.stringify({
            titles: { en: "Black Clover: Jump Festa 2016 Special" },
            mappings: { anilist_id: 87528, type: "OVA" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://graphql.anilist.co")) {
        return new Response(
          JSON.stringify({
            data: {
              Page: {
                media: [
                  {
                    id: 97940,
                    idMal: 34572,
                    isAdult: false,
                    title: { english: "Black Clover", romaji: "Black Clover" },
                    coverImage: { extraLarge: null, large: null, medium: null },
                    bannerImage: null,
                    seasonYear: 2017,
                    averageScore: 80,
                    popularity: 500000,
                    genres: ["Action", "Fantasy"],
                    description: null,
                    episodes: 170,
                    duration: 24,
                    status: "FINISHED",
                    format: "TV",
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const bridgedId = await resolveAniListIdForItem({
      source: "tvmaze",
      id: "31396",
      title: "Black Clover",
      imdbId: "tt7441658",
    });
    expect(bridgedId).toBe("97940");
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

  it("decrypts MegaPlay sources, signs CDN URLs, blocks silent sub fallback on dub requests, and rejects stub MP4s", async () => {
    const crypto = await import("node:crypto");
    const { decryptMegaplaySourcesEnc, extractMegaplayDirectStream, signMegaplayCdnUrl } =
      await import("@/lib/stream/anime-fr");

    const encryptEnc = (payload: object) => {
      const key = Buffer.alloc(32, 0);
      Buffer.from("i?LMTAx0Q6,:}50U", "utf8").copy(key);
      const iv = Buffer.alloc(16, 0);
      Buffer.from("W0;27ToaUpl_P%'c", "utf8").copy(iv);
      const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
      return Buffer.concat([
        cipher.update(JSON.stringify(payload), "utf8"),
        cipher.final(),
      ]).toString("base64url");
    };

    const sampleMaster =
      "https://fetch.nexabloom.top/anime/0123456789abcdef0123456789abcdef/fedcba9876543210fedcba9876543210/master.m3u8";
    const encPayload = encryptEnc({ file: sampleMaster });
    expect(decryptMegaplaySourcesEnc(encPayload)).toEqual({ file: sampleMaster });

    const signedCdn = signMegaplayCdnUrl(sampleMaster, "dub", 3600);
    expect(signedCdn).toContain("?t=dub&token=");

    // Rejects silent sub HTML when dub was requested
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        `<html><div data-id="999111"></div><script>const settings = { type: "sub" };</script></html>`,
        { status: 200 },
      ),
    );
    const silentSubOnDub = await extractMegaplayDirectStream(
      "https://megaplay.buzz/stream/mal/34572/3/dub",
      { requestedAudio: "dub" },
    );
    expect(silentSubOnDub.source).toBeNull();
    vi.restoreAllMocks();

    // End-to-end Black Clover EP 3 SUB: rejects 88KB animeheaven stub MP4, resolves full 1080p MegaPlay HLS on Server 1, drops Thumbnails sprite track
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes("api.ani.zip") || url.includes("arm.haglund.dev")) {
        return new Response(JSON.stringify({ mappings: { mal_id: 34572, imdb_id: "tt7441658" } }), {
          status: 200,
        });
      }
      if (url.includes("anilast.xyz/api/anime/stream/34572/3")) {
        return new Response(
          JSON.stringify({
            provider: "animeheaven",
            type: "mp4",
            url: "/api/proxy/stream?url=https%3A%2F%2Fax.animeheaven.me%2Fvideo.mp4%3Fstub",
            subtitles: [
              { url: "https://cdn.example.net/sprite.vtt", lang: "th", label: "Thumbnails" },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("anilast.xyz/api/anime/stream/97940/3")) {
        return new Response(
          JSON.stringify({
            provider: "aniwaves",
            type: "hls",
            url: "/api/proxy/hls?url=https%3A%2F%2Fbackup.example.net%2F720p%2Fplaylist.m3u8",
            subtitles: [
              { url: "https://cdn.example.net/thumbnails.vtt", lang: "th", label: "Thumbnails" },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("ax.animeheaven.me/video.mp4")) {
        return new Response(new Uint8Array([0]), {
          status: 206,
          headers: {
            "content-type": "video/mp4",
            "content-range": "bytes 0-0/88566",
          },
        });
      }
      if (url === "https://megaplay.buzz/stream/mal/34572/3/sub") {
        return new Response(
          `<html><title>File 777222</title><div id="megaplay-player" data-id="777222"></div><script>const settings = { type: "sub" };</script></html>`,
          { status: 200 },
        );
      }
      if (url.startsWith("https://megaplay.buzz/stream/getSources?id=777222")) {
        return new Response(
          JSON.stringify({
            enc: encPayload,
            tracks: [
              {
                file: "https://cdn.example.net/sprite.vtt",
                label: "Thumbnails",
                kind: "thumbnails",
              },
              { file: "https://cdn.example.net/en.vtt", label: "English", kind: "captions" },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.startsWith("https://fetch.nexabloom.top/anime/0123456789abcdef0123456789abcdef")) {
        return new Response("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=3000000\n1080.m3u8\n", {
          status: 200,
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const res = await resolveAnimeStream({
      anilistId: "97940",
      malId: 34572,
      episode: 3,
      audio: "sub",
      lang: "en",
      title: "Black Clover",
    });

    expect(res.ok).toBe(true);
    expect(res.streamUrl).toContain("/api/media/segment?token=");
    expect(res.sources).toHaveLength(2);
    expect(res.sources?.[0]?.label).toBe("Server 1 · SUB");
    expect(res.sources?.[0]?.url).toContain("/api/media/segment?token=");
    expect(res.sources?.[1]?.label).toBe("Server 2 · SUB");
    expect(res.sources?.[1]?.url).toContain("/api/anilast/hls");
    expect(res.subtitles).toHaveLength(1);
    expect(res.subtitles[0]?.label).toBe("English");
  });

  it("skips 404/HTML subtitle tracks to download a working WEBVTT track and maps multi-season TVmaze anime episodes continuously", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url === "https://cdn.example.net/ep1.mp4") {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "video/mp4" },
        });
      }
      if (url === "https://cdn.example.net/broken-en.vtt") {
        return new Response("<!DOCTYPE html><html>404 Not Found</html>", { status: 404 });
      }
      if (url === "https://cdn.example.net/working-en.vtt") {
        return new Response("WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nAsta!\n", { status: 200 });
      }
      if (url.startsWith("https://api.tvmaze.com/shows/31467")) {
        return new Response(
          JSON.stringify({
            id: 31467,
            name: "Black Clover",
            language: "Japanese",
            genres: ["Animation", "Anime", "Fantasy"],
            externals: { imdb: "tt7441658" },
            _embedded: {
              episodes: [
                ...Array.from({ length: 170 }, (_, idx) => ({
                  id: 1000 + idx,
                  season: 1,
                  number: idx + 1,
                  name: `Episode ${idx + 1}`,
                })),
                { id: 2001, season: 2, number: 1, name: "Season 2 Ep 1" },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("api.ani.zip/mappings")) {
        return new Response(
          JSON.stringify({ mappings: { anilist_id: 97940, mal_id: 34572, imdb_id: "tt7441658" } }),
          {
            status: 200,
          },
        );
      }
      if (url.includes("arm.haglund.dev")) {
        return new Response("Not Found", { status: 404 });
      }
      if (url.includes("anilast.xyz/api/anime/stream/34572/171")) {
        return new Response(
          JSON.stringify({
            provider: "aniwaves",
            type: "hls",
            url: "/api/proxy/hls?url=https%3A%2F%2Fcdn.example.net%2Fs2e1%2Fplaylist.m3u8",
          }),
          { status: 200 },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const downloaded = await downloadStream(
      {
        url: "https://cdn.example.net/ep1.mp4",
        type: "mp4",
        provider: "SHADOW Stream",
        isDemo: false,
        subtitles: [
          { url: "https://cdn.example.net/broken-en.vtt", lang: "en", label: "English (Broken)" },
          {
            url: "https://cdn.example.net/working-en.vtt",
            lang: "en",
            label: "English (Working)",
          },
        ],
      },
      {
        filename: "Black_Clover_E1_SUB",
        includeSubtitles: true,
        lang: "en",
        skipSaveFile: true,
      },
    );
    expect(downloaded.subtitleVtt).toContain("Asta!");

    const { resolveContinuousAnimeEpisode } = await import("@/lib/stream/resolver");
    const mappedEp = await resolveContinuousAnimeEpisode({
      source: "tvmaze",
      id: "31467",
      mediaType: "tv",
      season: 2,
      episode: 1,
    });
    expect(mappedEp).toBe(171);

    const resolved = await resolveAnimeStream({
      anilistId: "97940",
      malId: 34572,
      episode: mappedEp,
      audio: "sub",
      lang: "en",
      title: "Black Clover",
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.streamUrl).toBe(
      "/api/anilast/hls?url=https%3A%2F%2Fcdn.example.net%2Fs2e1%2Fplaylist.m3u8",
    );
  });
});
