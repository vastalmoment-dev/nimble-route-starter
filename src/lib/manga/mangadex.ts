import type { SiteLanguage } from "@/lib/i18n/language";
import {
  MANGA_GENRE_TAGS,
  type MangaChapter,
  type MangaFeedKind,
  type MangaItem,
  type MangaPageSource,
} from "./types";

export { MANGA_GENRE_TAGS };
export type { MangaChapter, MangaFeedKind, MangaItem, MangaPageSource };

const MANGADEX_API = "https://api.mangadex.org";
const SERVER_USER_AGENT = "ShadowStreamingApp/1.0 (https://shadow.app)";

function buildRequestHeaders(): Record<string, string> {
  if (typeof window === "undefined") {
    return { "User-Agent": SERVER_USER_AGENT, Accept: "application/json" };
  }
  return { Accept: "application/json" };
}

async function fetchMangaJson<T>(url: string, timeoutMs = 10000): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        headers: buildRequestHeaders(),
        ...(controller ? { signal: controller.signal } : {}),
      });
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      if (!res.ok) throw new Error(`MangaDex request failed (${res.status})`);
      return (await res.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("MangaDex request failed");
}

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
    tags?: { attributes?: { name?: Record<string, string>; group?: string } }[];
  };
  relationships?: {
    type?: string;
    attributes?: { fileName?: string };
  }[];
}

function pickLocalized(
  map: Record<string, string> | undefined,
  alt: Record<string, string>[] | undefined,
  lang: SiteLanguage = "en",
): string {
  const order = lang === "fr" ? ["fr", "en", "ja-ro"] : ["en", "ja-ro"];
  if (map) {
    for (const code of order) {
      if (map[code]?.trim()) return map[code]!;
    }
    const first = Object.values(map).find((v) => typeof v === "string" && v.trim());
    if (first) return first;
  }
  if (alt?.length) {
    for (const code of order) {
      for (const a of alt) {
        if (a[code]?.trim()) return a[code]!;
      }
    }
  }
  return "Untitled";
}

function mapManga(raw: RawManga, lang: SiteLanguage = "en"): MangaItem {
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
    .map((t) => {
      const names = t.attributes?.name;
      if (!names) return "";
      return (lang === "fr" ? names["fr"] || names["en"] : names["en"]) ?? "";
    })
    .filter(Boolean)
    .slice(0, 4);

  const descMap = raw.attributes.description ?? {};
  const rawDesc =
    (lang === "fr" ? descMap["fr"] : undefined) || descMap["en"] || Object.values(descMap)[0] || "";
  const description = rawDesc
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    id: raw.id,
    title: pickLocalized(raw.attributes.title, raw.attributes.altTitles, lang),
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
  lang?: SiteLanguage | undefined;
}): Promise<{ items: MangaItem[]; total: number }> {
  const lang = params.lang ?? "en";
  const sp = new URLSearchParams();
  sp.set("limit", String(Math.min(48, Math.max(1, params.limit ?? 30))));
  sp.set("offset", String(Math.max(0, params.offset ?? 0)));
  sp.append("includes[]", "cover_art");
  sp.append("contentRating[]", "safe");
  sp.append("contentRating[]", "suggestive");
  if (lang === "fr") {
    sp.append("availableTranslatedLanguage[]", "fr");
    sp.append("availableTranslatedLanguage[]", "en");
  } else {
    sp.append("availableTranslatedLanguage[]", "en");
  }
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

  const tagId = params.genre && params.genre !== "All" ? MANGA_GENRE_TAGS[params.genre] : undefined;
  if (tagId) sp.append("includedTags[]", tagId);

  const json = await fetchMangaJson<{ data?: RawManga[]; total?: number }>(
    `${MANGADEX_API}/manga?${sp.toString()}`,
  );
  return {
    items: (json.data ?? []).map((row) => mapManga(row, lang)),
    total: json.total ?? 0,
  };
}

interface RawChapterRow {
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
}

async function queryMangaFeedByLanguage(
  mangaId: string,
  translatedLang: "en" | "fr",
): Promise<MangaChapter[]> {
  const sp = new URLSearchParams();
  sp.set("limit", "100");
  sp.append("translatedLanguage[]", translatedLang);
  sp.append("contentRating[]", "safe");
  sp.append("contentRating[]", "suggestive");
  sp.append("includes[]", "scanlation_group");
  sp.set("includeFuturePublishAt", "0");
  sp.set("includeExternalUrl", "0");
  sp.set("order[chapter]", "asc");

  const json = await fetchMangaJson<{ data?: RawChapterRow[] }>(
    `${MANGADEX_API}/manga/${encodeURIComponent(mangaId)}/feed?${sp.toString()}`,
  );

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

export async function fetchMangaChaptersList(
  mangaId: string,
  lang: SiteLanguage = "en",
): Promise<MangaChapter[]> {
  if (lang === "fr") {
    const frChapters = await queryMangaFeedByLanguage(mangaId, "fr");
    if (frChapters.length > 0) return frChapters;
  }
  return queryMangaFeedByLanguage(mangaId, "en");
}

export async function fetchMangaChapterPageUrls(chapterId: string): Promise<MangaPageSource[]> {
  const json = await fetchMangaJson<{
    baseUrl?: string;
    chapter?: { hash?: string; data?: string[]; dataSaver?: string[] };
  }>(`${MANGADEX_API}/at-home/server/${encodeURIComponent(chapterId)}`);

  const baseUrl = json.baseUrl;
  const hash = json.chapter?.hash;
  const useSaver = Boolean(json.chapter?.dataSaver?.length);
  const files = useSaver ? json.chapter?.dataSaver : json.chapter?.data;
  const folder = useSaver ? "data-saver" : "data";
  if (!baseUrl || !hash || !files?.length) return [];
  const origin = new URL(baseUrl).origin;
  return files.map((file) => {
    const upstreamUrl = `${origin}/${folder}/${hash}/${file}`;
    const fallbackUrl = `/api/manga/page?chapterId=${encodeURIComponent(chapterId)}&file=${encodeURIComponent(file)}${useSaver ? "&saver=1" : ""}`;
    return {
      url: upstreamUrl,
      fallbackUrl,
    };
  });
}
