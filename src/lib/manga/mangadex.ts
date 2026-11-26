import { buildSignedMangaPageUrl } from "./manga-proxy";

const MANGADEX_API = "https://api.mangadex.org";
const USER_AGENT = "ShadowStreamingApp/1.0 (https://shadow.app)";

export type MangaFeedKind = "latest" | "popular" | "top" | "newest";

export interface MangaItem {
  id: string;
  title: string;
  coverUrl: string | null;
  coverFallbackUrl?: string | null;
  genres: string[];
  status: string | null;
  year: number | null;
  description: string;
  lastChapter: string | null;
  updatedAt: string | null;
}

export interface MangaPageSource {
  url: string;
  fallbackUrl: string;
}

export interface MangaChapter {
  id: string;
  chapter: string;
  numberValue: number;
  volume: string | null;
  title: string | null;
  pages: number;
  publishAt: string | null;
  scanlator: string | null;
}

export const MANGA_GENRE_TAGS: Record<string, string> = {
  Action: "391b0423-d847-456f-aff0-8b0cfc03066b",
  Adventure: "87cc87cd-a395-47af-b27a-93258283bbc6",
  Comedy: "4d32cc48-9f00-4cca-9b5a-a839f0764984",
  Drama: "b9af3a63-f058-46de-a9a0-e0c13906197a",
  Fantasy: "cdc58593-87dd-415e-bbc0-2ae27bf404cc",
  Horror: "cdad7e68-1419-41dd-bdce-27753074a640",
  Mystery: "ee968100-4191-4968-93d3-f82d72be7e46",
  Romance: "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  "Sci-Fi": "256c8bd9-4904-4360-bf4f-508a76d67183",
  "Slice of Life": "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  Sports: "69964a64-2f90-4d33-beeb-f3ed2875eb4c",
  Supernatural: "eabc5b4c-6aff-42f3-b657-3e90cbd00b75",
};

interface RawManga {
  id: string;
  attributes: {
    title?: Record<string, string>;
    altTitles?: Record<string, string>[];
    description?: Record<string, string>;
    status?: string | null;
    year?: number | null;
    lastChapter?: string | null;
    updatedAt?: string | null;
    tags?: { attributes?: { name?: { en?: string }; group?: string } }[];
  };
  relationships?: {
    type?: string;
    attributes?: { fileName?: string };
  }[];
}

function pickLocalized(
  map: Record<string, string> | undefined,
  alt?: Record<string, string>[],
): string {
  if (map) {
    if (map["en"]) return map["en"];
    if (map["ja-ro"]) return map["ja-ro"];
    const first = Object.values(map).find((v) => typeof v === "string" && v.trim());
    if (first) return first;
  }
  if (alt?.length) {
    for (const a of alt) {
      if (a["en"]) return a["en"];
    }
  }
  return "Untitled";
}

function mapManga(raw: RawManga): MangaItem {
  const coverRel = raw.relationships?.find((r) => r.type === "cover_art");
  const fileName = coverRel?.attributes?.fileName;
  const coverUrl = fileName
    ? `https://uploads.mangadex.org/covers/${encodeURIComponent(raw.id)}/${encodeURIComponent(fileName)}.512.jpg`
    : null;
  const coverFallbackUrl = fileName
    ? `/api/manga/cover?mangaId=${encodeURIComponent(raw.id)}&file=${encodeURIComponent(fileName)}`
    : null;
  const genres = (raw.attributes.tags ?? [])
    .filter((t) => t.attributes?.group === "genre" || t.attributes?.group === "theme")
    .map((t) => t.attributes?.name?.en ?? "")
    .filter(Boolean)
    .slice(0, 4);

  const rawDesc =
    raw.attributes.description?.["en"] || Object.values(raw.attributes.description ?? {})[0] || "";
  const description = rawDesc
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    id: raw.id,
    title: pickLocalized(raw.attributes.title, raw.attributes.altTitles),
    coverUrl,
    coverFallbackUrl,
    genres,
    status: raw.attributes.status ?? null,
    year: raw.attributes.year ?? null,
    description,
    lastChapter: raw.attributes.lastChapter ?? null,
    updatedAt: raw.attributes.updatedAt ?? null,
  };
}

export async function fetchMangaList(params: {
  feed: MangaFeedKind;
  q?: string | undefined;
  genre?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}): Promise<{ items: MangaItem[]; total: number }> {
  const sp = new URLSearchParams();
  sp.set("limit", String(Math.min(48, Math.max(1, params.limit ?? 30))));
  sp.set("offset", String(Math.max(0, params.offset ?? 0)));
  sp.append("includes[]", "cover_art");
  sp.append("contentRating[]", "safe");
  sp.append("contentRating[]", "suggestive");
  sp.append("availableTranslatedLanguage[]", "en");
  sp.set("hasAvailableChapters", "true");

  const q = params.q?.trim();
  if (q) {
    sp.set("title", q);
    sp.set("order[relevance]", "desc");
  } else if (params.feed === "latest") {
    sp.set("order[latestUploadedChapter]", "desc");
  } else if (params.feed === "popular") {
    sp.set("order[followedCount]", "desc");
  } else if (params.feed === "top") {
    sp.set("order[rating]", "desc");
  } else {
    sp.set("order[createdAt]", "desc");
  }

  const tagId = params.genre && MANGA_GENRE_TAGS[params.genre];
  if (tagId) sp.append("includedTags[]", tagId);

  const res = await fetch(`${MANGADEX_API}/manga?${sp.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`Manga catalog failed (${res.status})`);
  const json = (await res.json()) as { data?: RawManga[]; total?: number };
  return {
    items: (json.data ?? []).map(mapManga),
    total: json.total ?? 0,
  };
}

export async function fetchMangaChaptersList(mangaId: string): Promise<MangaChapter[]> {
  const sp = new URLSearchParams();
  sp.set("limit", "100");
  sp.append("translatedLanguage[]", "en");
  sp.append("contentRating[]", "safe");
  sp.append("contentRating[]", "suggestive");
  sp.append("includes[]", "scanlation_group");
  sp.set("includeFuturePublishAt", "0");
  sp.set("order[chapter]", "asc");

  const res = await fetch(
    `${MANGADEX_API}/manga/${encodeURIComponent(mangaId)}/feed?${sp.toString()}`,
    {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    },
  );
  if (!res.ok) throw new Error(`Manga chapters failed (${res.status})`);

  const json = (await res.json()) as {
    data?: {
      id: string;
      attributes: {
        chapter?: string | null;
        volume?: string | null;
        title?: string | null;
        pages?: number;
        publishAt?: string | null;
        externalUrl?: string | null;
      };
      relationships?: { type?: string; attributes?: { name?: string } }[];
    }[];
  };

  // Deduplicate repeated scanlations per chapter number, preferring hosted chapters with the most pages.
  const byChapter = new Map<string, MangaChapter>();
  for (const row of json.data ?? []) {
    if (row.attributes.externalUrl || (row.attributes.pages ?? 0) === 0) continue;
    const chStr = row.attributes.chapter?.trim() || "0";
    const numVal = Number.parseFloat(chStr);
    const groupRel = row.relationships?.find((r) => r.type === "scanlation_group");
    const mapped: MangaChapter = {
      id: row.id,
      chapter: chStr,
      numberValue: Number.isFinite(numVal) ? numVal : 0,
      volume: row.attributes.volume ?? null,
      title: row.attributes.title?.trim() || null,
      pages: row.attributes.pages ?? 0,
      publishAt: row.attributes.publishAt ?? null,
      scanlator: groupRel?.attributes?.name ?? null,
    };
    const existing = byChapter.get(chStr);
    if (!existing || mapped.pages > existing.pages) {
      byChapter.set(chStr, mapped);
    }
  }

  return [...byChapter.values()].sort((a, b) => a.numberValue - b.numberValue);
}

export async function fetchMangaChapterPageUrls(chapterId: string): Promise<MangaPageSource[]> {
  const res = await fetch(`${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`Chapter pages failed (${res.status})`);
  const json = (await res.json()) as {
    baseUrl?: string;
    chapter?: { hash?: string; data?: string[]; dataSaver?: string[] };
  };
  const baseUrl = json.baseUrl;
  const hash = json.chapter?.hash;
  const files = json.chapter?.dataSaver?.length ? json.chapter.dataSaver : json.chapter?.data;
  const folder = json.chapter?.dataSaver?.length ? "data-saver" : "data";
  if (!baseUrl || !hash || !files?.length) return [];
  const origin = new URL(baseUrl).origin;
  return files.map((file) => {
    const upstreamUrl = `${origin}/${folder}/${hash}/${file}`;
    return {
      url: upstreamUrl,
      fallbackUrl: buildSignedMangaPageUrl(upstreamUrl),
    };
  });
}
