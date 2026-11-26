import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MangaPage } from "@/components/media/MangaPage";
import {
  buildCbzArchive,
  buildSignedMangaPageUrl,
  handleMangaProxyRequest,
  isAllowedMangaImageHost,
  verifyPageToken,
} from "@/lib/manga/manga-proxy";
import type { MangaChapter, MangaItem } from "@/lib/manga/mangadex";

const SAMPLE_MANGA: MangaItem[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Kagurabachi",
    coverUrl: "/api/manga/cover?mangaId=11111111-1111-4111-8111-111111111111&file=cover.jpg",
    genres: ["Action", "Fantasy"],
    status: "ongoing",
    year: 2023,
    description: "Young swordsmith Chihiro seeks vengeance with enchanted blades.",
    lastChapter: "68",
    updatedAt: "2026-11-25T10:00:00Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Sakamoto Days",
    coverUrl: "/api/manga/cover?mangaId=22222222-2222-4222-8222-222222222222&file=sakamoto.jpg",
    genres: ["Action", "Comedy"],
    status: "ongoing",
    year: 2020,
    description: "A legendary hitman retires to run a neighborhood store.",
    lastChapter: "200",
    updatedAt: "2026-11-24T10:00:00Z",
  },
];

const SAMPLE_CHAPTERS: MangaChapter[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    chapter: "1",
    numberValue: 1,
    volume: "1",
    title: "Mission to Do",
    pages: 54,
    publishAt: "2023-09-18T00:00:00Z",
    scanlator: "Official",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    chapter: "2",
    numberValue: 2,
    volume: "1",
    title: "Heaps",
    pages: 25,
    publishAt: "2023-09-25T00:00:00Z",
    scanlator: "Official",
  },
];

vi.mock("@/lib/manga/manga.functions", () => ({
  getMangaCatalog: vi.fn(async () => ({ items: SAMPLE_MANGA, total: 2 })),
  getMangaChapters: vi.fn(async () => SAMPLE_CHAPTERS),
  getMangaChapterPages: vi.fn(async () => [
    "/api/manga/page?token=mock-1",
    "/api/manga/page?token=mock-2",
  ]),
}));

afterEach(cleanup);

describe("CBZ archive builder & SSRF proxy security", () => {
  it("builds a valid ZIP/CBZ archive with local headers and EOCD signature", () => {
    const zip = buildCbzArchive([
      { name: "001.jpg", data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) },
      { name: "002.png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    ]);

    // Starts with PK\x03\x04 local file header signature
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    // Ends with PK\x05\x06 End of Central Directory signature
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    // Contains 2 files in EOCD
    expect(zip.readUInt16LE(zip.length - 14)).toBe(2);
    expect(zip.includes(Buffer.from("001.jpg"))).toBe(true);
    expect(zip.includes(Buffer.from("002.png"))).toBe(true);
  });

  it("validates allowed image hosts and rejects tampered or malformed page tokens", async () => {
    expect(isAllowedMangaImageHost("uploads.mangadex.org")).toBe(true);
    expect(isAllowedMangaImageHost("cmdxd98sb0x3yprd.mangadex.network")).toBe(true);
    expect(isAllowedMangaImageHost("127.0.0.1")).toBe(false);
    expect(isAllowedMangaImageHost("evil.example.com")).toBe(false);

    const signed = buildSignedMangaPageUrl("https://uploads.mangadex.org/data/hash/1.jpg");
    const token = new URL(`http://localhost${signed}`).searchParams.get("token");
    expect(verifyPageToken(token)).toBe("https://uploads.mangadex.org/data/hash/1.jpg");
    expect(verifyPageToken(`${token}tamper`)).toBeNull();

    const badCover = await handleMangaProxyRequest(
      new Request("http://localhost/api/manga/cover?mangaId=not-a-uuid&file=../../etc/passwd"),
    );
    expect(badCover?.status).toBe(400);

    const badPage = await handleMangaProxyRequest(
      new Request("http://localhost/api/manga/page?token=forged.sig"),
    );
    expect(badPage?.status).toBe(403);
  });
});

describe("Free Manga library UI", () => {
  it("renders auto-updating tabs, free CBZ download links, ordered chapters, and fullscreen reader", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MangaPage />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("tab", { name: "New Releases" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Popular" })).toBeTruthy();

    expect(await screen.findByText("Kagurabachi")).toBeTruthy();
    const downloadLink = screen.getByRole("link", { name: "Free download Kagurabachi" });
    expect(downloadLink.getAttribute("href")).toContain(
      "/api/manga/download?mangaId=11111111-1111-4111-8111-111111111111&which=latest",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Kagurabachi chapters" }));

    const list = await screen.findByTestId("manga-chapter-list");
    expect(list.textContent).toContain("Ch. 1");
    expect(list.textContent).toContain("Ch. 2");

    const ch1Download = screen.getByRole("link", { name: "Free download chapter 1" });
    expect(ch1Download.getAttribute("href")).toContain(
      "/api/manga/download?chapterId=33333333-3333-4333-8333-333333333333",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Read" })[0]!);
    await waitFor(() => {
      expect(screen.getByAltText("Page 1")).toBeTruthy();
      expect(screen.getByAltText("Page 2")).toBeTruthy();
    });
  });
});
