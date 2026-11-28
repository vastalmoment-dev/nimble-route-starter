import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  computeLiveSectionCatalog,
  NON_ANIME_SECTIONS,
  searchLiveMediaCatalog,
} from "./live-catalog";
import type { MediaItem, SectionCatalog } from "./types";

export const getLiveSectionCatalog = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        section: z.enum(NON_ANIME_SECTIONS),
        lang: z.enum(["en", "fr"]).default("en"),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<SectionCatalog> => {
    return computeLiveSectionCatalog(data.section, data.lang);
  });

export const searchMediaCatalog = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        q: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<MediaItem[]> => {
    return searchLiveMediaCatalog(data.q);
  });
