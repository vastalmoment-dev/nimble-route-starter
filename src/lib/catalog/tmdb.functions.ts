import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchTmdbDetailWithKey, fetchTmdbSectionWithKey, TMDB_SECTIONS } from "./tmdb-shared";
import type { MediaDetail, MediaItem } from "./types";

/**
 * TMDB integration. Keeps server-side TMDB_API_KEY out of the browser bundle.
 * When the secret is absent, functions return { enabled: false } and the app uses client catalogs / fallback.
 */
export const getTmdbSection = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        section: z.enum(TMDB_SECTIONS),
        lang: z.enum(["en", "fr"]).default("en"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env["TMDB_API_KEY"];
    if (!key) return { enabled: false as const, items: [] as MediaItem[] };
    const result = await fetchTmdbSectionWithKey(data.section, data.lang, key);
    return { enabled: result.enabled, items: result.items };
  });

export const getTmdbDetail = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        id: z.string().regex(/^(tv|movie)-\d+$/),
        lang: z.enum(["en", "fr"]).default("en"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<MediaDetail | null> => {
    const key = process.env["TMDB_API_KEY"];
    if (!key) return null;
    return fetchTmdbDetailWithKey(data.id, data.lang, key);
  });
