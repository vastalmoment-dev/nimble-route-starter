import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchMangaChapterPageUrls, fetchMangaChaptersList, fetchMangaList } from "./mangadex";

export const getMangaCatalog = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        feed: z.enum(["latest", "popular", "top", "newest"]).default("latest"),
        q: z.string().max(120).optional(),
        genre: z.string().max(40).optional(),
        offset: z.number().int().min(0).max(1000).default(0),
        lang: z.enum(["en", "fr"]).default("en"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return fetchMangaList({
      feed: data.feed,
      q: data.q,
      genre: data.genre && data.genre !== "All" ? data.genre : undefined,
      limit: 30,
      offset: data.offset,
      lang: data.lang,
    });
  });

export const getMangaChapters = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        mangaId: z
          .string()
          .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
        lang: z.enum(["en", "fr"]).default("en"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return fetchMangaChaptersList(data.mangaId, data.lang);
  });

export const getMangaChapterPages = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        chapterId: z
          .string()
          .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    return fetchMangaChapterPageUrls(data.chapterId);
  });
