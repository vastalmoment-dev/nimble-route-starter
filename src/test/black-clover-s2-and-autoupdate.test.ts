import { afterEach, describe, expect, it, vi } from "vitest";
import { clearClientMemoryCache } from "@/lib/cache/client-cache";
import { fetchAnimeDetail, mapAniMedia } from "@/lib/catalog/anilist";
import { resolveAnimeSeasonTarget } from "@/lib/catalog/anime-bridge";
import { clearServerCatalogCache, handleCatalogApiRequest } from "@/lib/catalog/catalog-api";
import { downloadStream } from "@/lib/download/downloader";
import { parseAudioTracks, pickAudioRendition } from "@/lib/download/hls";
import { muxMpegTsVideoAndAudio } from "@/lib/download/ts-mux";
import { resolveContinuousAnimeEpisode } from "@/lib/stream/resolver";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function mpegCrc32Test(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]! << 24;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x80000000) !== 0 ? ((crc << 1) ^ 0x04c11db7) >>> 0 : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}

function makePatPacket(pmtPid = 0x1000): Uint8Array {
  const pkt = new Uint8Array(188).fill(0xff);
  pkt[0] = 0x47;
  pkt[1] = 0x40;
  pkt[2] = 0x00;
  pkt[3] = 0x10;
  pkt[4] = 0x00; // pointer
  const bodyLen = 13;
  const sec = pkt.subarray(5, 5 + 3 + bodyLen);
  sec[0] = 0x00;
  sec[1] = 0xb0;
  sec[2] = bodyLen;
  sec[3] = 0x00;
  sec[4] = 0x01;
  sec[5] = 0xc1;
  sec[6] = 0x00;
  sec[7] = 0x00;
  sec[8] = 0x00;
  sec[9] = 0x01; // prog 1
  sec[10] = 0xe0 | ((pmtPid >> 8) & 0x1f);
  sec[11] = pmtPid & 0xff;
  const crc = mpegCrc32Test(sec.subarray(0, 12));
  sec[12] = (crc >>> 24) & 0xff;
  sec[13] = (crc >>> 16) & 0xff;
  sec[14] = (crc >>> 8) & 0xff;
  sec[15] = crc & 0xff;
  return pkt;
}

function makePmtPacket(pmtPid: number, streamType: number, esPid: number): Uint8Array {
  const pkt = new Uint8Array(188).fill(0xff);
  pkt[0] = 0x47;
  pkt[1] = 0x40 | ((pmtPid >> 8) & 0x1f);
  pkt[2] = pmtPid & 0xff;
  pkt[3] = 0x10;
  pkt[4] = 0x00;
  const bodyLen = 9 + 5 + 4;
  const sec = pkt.subarray(5, 5 + 3 + bodyLen);
  sec[0] = 0x02;
  sec[1] = 0xb0;
  sec[2] = bodyLen;
  sec[3] = 0x00;
  sec[4] = 0x01;
  sec[5] = 0xc1;
  sec[6] = 0x00;
  sec[7] = 0x00;
  sec[8] = 0xe0 | ((esPid >> 8) & 0x1f);
  sec[9] = esPid & 0xff;
  sec[10] = 0xf0;
  sec[11] = 0x00;
  sec[12] = streamType;
  sec[13] = 0xe0 | ((esPid >> 8) & 0x1f);
  sec[14] = esPid & 0xff;
  sec[15] = 0xf0;
  sec[16] = 0x00;
  const crc = mpegCrc32Test(sec.subarray(0, 17));
  sec[17] = (crc >>> 24) & 0xff;
  sec[18] = (crc >>> 16) & 0xff;
  sec[19] = (crc >>> 8) & 0xff;
  sec[20] = crc & 0xff;
  return pkt;
}

function makePesPacket(pid: number, marker: number): Uint8Array {
  const pkt = new Uint8Array(188).fill(marker);
  pkt[0] = 0x47;
  pkt[1] = 0x40 | ((pid >> 8) & 0x1f);
  pkt[2] = pid & 0xff;
  pkt[3] = 0x10;
  return pkt;
}

function concatPackets(packets: Uint8Array[]): ArrayBuffer {
  const out = new Uint8Array(packets.length * 188);
  packets.forEach((p, idx) => out.set(p, idx * 188));
  return out.buffer;
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read Blob"));
    reader.readAsArrayBuffer(blob);
  });
}

describe("Black Clover Season 2 routing, split-audio HLS muxing, and catalog auto-updates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearClientMemoryCache();
    clearServerCatalogCache();
  });

  it("maps Cinemeta/TVmaze multi-season Black Clover S2 onto released AniList sequel 195604 Ep 1 while preserving continuous helper", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url === "https://graphql.anilist.co") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { variables?: { id?: number } };
        const id = body.variables?.id;
        if (id === 97940) {
          return new Response(
            JSON.stringify({
              data: {
                Media: {
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
                  airingSchedule: { nodes: [] },
                  streamingEpisodes: [],
                  externalLinks: [],
                  relations: {
                    edges: [
                      {
                        relationType: "SEQUEL",
                        node: {
                          id: 195604,
                          idMal: 61967,
                          isAdult: false,
                          type: "ANIME",
                          title: { english: null, romaji: "Black Clover 2nd Season" },
                          format: "TV",
                          episodes: 24,
                          nextAiringEpisode: { episode: 10, airingAt: 1796479200 },
                          status: "RELEASING",
                          seasonYear: 2026,
                          coverImage: { large: null, medium: null },
                        },
                      },
                    ],
                  },
                  characters: { edges: [] },
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (id === 195604) {
          return new Response(
            JSON.stringify({
              data: {
                Media: {
                  id: 195604,
                  idMal: 61967,
                  isAdult: false,
                  title: { english: "Black Clover Season 2", romaji: "Black Clover 2nd Season" },
                  coverImage: { extraLarge: null, large: null, medium: null },
                  bannerImage: null,
                  seasonYear: 2026,
                  averageScore: 84,
                  popularity: 180000,
                  genres: ["Action", "Fantasy"],
                  description: null,
                  episodes: null,
                  nextAiringEpisode: { episode: 10, airingAt: 1796479200 },
                  duration: 24,
                  status: "RELEASING",
                  format: "TV",
                  airingSchedule: {
                    nodes: [
                      { episode: 9, airingAt: Math.floor(Date.now() / 1000) - 3600 },
                      // AniList still sometimes returns future nodes even with notYetAired: false
                      { episode: 10, airingAt: Math.floor(Date.now() / 1000) + 86400 * 7 },
                    ],
                  },
                  streamingEpisodes: [],
                  externalLinks: [],
                  relations: { edges: [] },
                  characters: { edges: [] },
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      if (url.startsWith("https://v3-cinemeta.strem.io/meta/series/tt7441658.json")) {
        return new Response(
          JSON.stringify({
            meta: {
              id: "tt7441658",
              type: "series",
              name: "Black Clover",
              videos: [
                ...Array.from({ length: 170 }, (_, idx) => ({
                  id: `tt7441658:1:${idx + 1}`,
                  season: 1,
                  number: idx + 1,
                })),
                { id: "tt7441658:2:4", season: 2, number: 4 },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const continuousEp = await resolveContinuousAnimeEpisode({
      source: "cinemeta",
      id: "series-tt7441658",
      mediaType: "tv",
      season: 2,
      episode: 1,
    });
    expect(continuousEp).toBe(171);

    const target = await resolveAnimeSeasonTarget({
      source: "cinemeta",
      canonicalAnilistId: "97940",
      season: 2,
      episode: 4,
      mediaType: "tv",
      continuousEpisode: 174,
    });
    expect(target.anilistId).toBe("195604");
    expect(target.malId).toBe(61967);
    expect(target.episode).toBe(4);
    expect(target.title).toBe("Black Clover Season 2");
  });

  it("includes already-aired nextAiringEpisode counts and filters future nodes leaked by AniList airingSchedule", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const airedItem = mapAniMedia({
      id: 195604,
      idMal: 61967,
      title: { english: "Black Clover Season 2", romaji: "Black Clover 2nd Season" },
      coverImage: { extraLarge: null, large: null },
      bannerImage: null,
      seasonYear: 2026,
      averageScore: 85,
      popularity: 1000,
      genres: ["Action"],
      description: null,
      episodes: null,
      nextAiringEpisode: { episode: 10, airingAt: nowSec - 60 },
      duration: 24,
      status: "RELEASING",
      format: "TV",
    });
    expect(airedItem.episodesCount).toBe(10);
    expect(airedItem.latestEpisode).toBe(10);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            Media: {
              id: 195604,
              idMal: 61967,
              isAdult: false,
              title: { english: "Black Clover Season 2", romaji: "Black Clover 2nd Season" },
              coverImage: { extraLarge: null, large: null, medium: null },
              bannerImage: null,
              seasonYear: 2026,
              averageScore: 84,
              popularity: 180000,
              genres: ["Action"],
              description: null,
              episodes: null,
              nextAiringEpisode: { episode: 11, airingAt: nowSec + 86400 * 7 },
              duration: 24,
              status: "RELEASING",
              format: "TV",
              airingSchedule: {
                nodes: [
                  { episode: 10, airingAt: nowSec - 120 },
                  { episode: 11, airingAt: nowSec + 86400 * 7 },
                  { episode: 12, airingAt: nowSec + 86400 * 14 },
                ],
              },
              streamingEpisodes: [],
              externalLinks: [],
              relations: { edges: [] },
              characters: { edges: [] },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const detail = await fetchAnimeDetail("195604", "en");
    expect(detail.episodesCount).toBe(10);
    expect(detail.latestEpisode).toBe(10);
  });

  it("parses #EXT-X-MEDIA audio tracks, remaps audio PID, and muxes video + separate audio TS in downloadStream", async () => {
    const videoBuf = concatPackets([
      makePatPacket(0x1000),
      makePmtPacket(0x1000, 0x1b, 0x0100), // H.264 video only on PID 0x0100
      makePesPacket(0x0100, 0xaa),
    ]);
    const audioBuf = concatPackets([
      makePatPacket(0x1000),
      makePmtPacket(0x1000, 0x0f, 0x0100), // AAC audio also on PID 0x0100 in separate track
      makePesPacket(0x0100, 0xbb),
    ]);

    const muxedParts = muxMpegTsVideoAndAudio([videoBuf], [audioBuf]);
    const muxedBytes = await readBlobBytes(new Blob(muxedParts));
    const pids = new Set<number>();
    let sawPat = 0;
    for (let off = 0; off + 188 <= muxedBytes.length; off += 188) {
      expect(muxedBytes[off]).toBe(0x47);
      const pid = ((muxedBytes[off + 1]! & 0x1f) << 8) | muxedBytes[off + 2]!;
      pids.add(pid);
      if (pid === 0x0000) sawPat++;
      if (pid === 0x1000) {
        const sectionLen = ((muxedBytes[off + 6]! & 0x0f) << 8) | muxedBytes[off + 7]!;
        const sec = muxedBytes.subarray(off + 5, off + 5 + 3 + sectionLen);
        const computed = mpegCrc32Test(sec.subarray(0, sec.length - 4));
        const stored =
          ((sec[sec.length - 4]! << 24) |
            (sec[sec.length - 3]! << 16) |
            (sec[sec.length - 2]! << 8) |
            sec[sec.length - 1]!) >>>
          0;
        expect(computed).toBe(stored);
      }
    }
    expect(sawPat).toBe(1);
    expect(pids.has(0x0100)).toBe(true);
    expect(pids.has(0x0101)).toBe(true);

    const masterM3u8 = [
      "#EXTM3U",
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Japanese",LANGUAGE="ja",DEFAULT=YES,URI="audio-ja.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=NO,URI="audio-en.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1920x1080,AUDIO="aud"',
      "video.m3u8",
    ].join("\n");

    const tracks = parseAudioTracks(masterM3u8, "https://cdn.example.net/ep4/master.m3u8");
    expect(pickAudioRendition(tracks, { groupId: "aud", audio: "dub", lang: "en" })?.language).toBe(
      "en",
    );
    expect(pickAudioRendition(tracks, { groupId: "aud", audio: "sub", lang: "en" })?.language).toBe(
      "ja",
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.endsWith("/master.m3u8")) {
        return new Response(masterM3u8, { status: 200 });
      }
      if (url.endsWith("/video.m3u8")) {
        return new Response("#EXTM3U\n#EXTINF:5,\nv0.ts\n", { status: 200 });
      }
      if (url.endsWith("/audio-en.m3u8")) {
        return new Response("#EXTM3U\n#EXTINF:5,\na0.ts\n", { status: 200 });
      }
      if (url.endsWith("/v0.ts")) {
        return new Response(videoBuf, { status: 200, headers: { "content-type": "video/mp2t" } });
      }
      if (url.endsWith("/a0.ts")) {
        return new Response(audioBuf, { status: 200, headers: { "content-type": "video/mp2t" } });
      }
      return new Response("Not Found", { status: 404 });
    });

    const result = await downloadStream(
      {
        url: "https://cdn.example.net/ep4/master.m3u8",
        type: "hls",
        provider: "SHADOW Stream",
        isDemo: false,
      },
      {
        filename: "Black_Clover_S2_E4_DUB",
        audio: "dub",
        lang: "en",
        skipSaveFile: true,
      },
    );

    const downloadedBytes = await readBlobBytes(result.blob);
    const downloadedPids = new Set<number>();
    for (let off = 0; off + 188 <= downloadedBytes.length; off += 188) {
      downloadedPids.add(((downloadedBytes[off + 1]! & 0x1f) << 8) | downloadedBytes[off + 2]!);
    }
    expect(downloadedPids.has(0x0100)).toBe(true);
    expect(downloadedPids.has(0x0101)).toBe(true);
  });

  it("performs background SWR refresh on stale /api/catalog/section cache so new releases appear automatically", async () => {
    clearServerCatalogCache();
    let releaseVersion = 1;
    let fakeNow = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => fakeNow);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes("api.tvmaze.com/schedule?country=KR")) {
        return new Response(
          JSON.stringify([
            {
              season: 1,
              number: releaseVersion,
              airdate: "2026-11-28",
              show: {
                id: 99124,
                name: "Auto Update Drama",
                type: "Scripted",
                language: "Korean",
                genres: ["Drama"],
                status: "Running",
                premiered: "2026-11-01",
                rating: { average: 8.5 },
                weight: 99,
                network: { name: "tvN", country: { name: "Korea, Republic of", code: "KR" } },
                image: {
                  medium: "https://static.tvmaze.com/kr.jpg",
                  original: "https://static.tvmaze.com/kr-orig.jpg",
                },
                summary: "<p>Ongoing show</p>",
              },
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes("api.tvmaze.com/schedule")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({ metas: [] }), { status: 200 });
    });

    const r1 = await handleCatalogApiRequest(
      new Request("http://localhost:3000/api/catalog/section?section=k-dramas&lang=en"),
    );
    const p1 = (await r1?.json()) as { items: { title: string; latestEpisode?: number }[] };
    expect(p1.items.find((i) => i.title === "Auto Update Drama")?.latestEpisode).toBe(1);

    // Advance clock past the 90s SWR threshold (but inside 10m max stale) and bump upstream release
    releaseVersion = 2;
    fakeNow += 120_000;

    // Next request serves stale immediately while triggering background refresh
    const r2 = await handleCatalogApiRequest(
      new Request("http://localhost:3000/api/catalog/section?section=k-dramas&lang=en"),
    );
    expect(r2?.status).toBe(200);
    await new Promise((r) => setTimeout(r, 40));

    // Subsequent request receives the refreshed episode 2 payload automatically
    const r3 = await handleCatalogApiRequest(
      new Request("http://localhost:3000/api/catalog/section?section=k-dramas&lang=en"),
    );
    const p3 = (await r3?.json()) as { items: { title: string; latestEpisode?: number }[] };
    expect(p3.items.find((i) => i.title === "Auto Update Drama")?.latestEpisode).toBe(2);
  });
});
