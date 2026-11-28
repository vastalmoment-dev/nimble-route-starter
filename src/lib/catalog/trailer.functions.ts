import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchTmdbVideosWithKey, searchTmdbTrailerWithKey } from "./tmdb-shared";

/** Finds an official YouTube trailer for a title. TMDB key stays on the server. */

async function anilistTrailer(id: string): Promise<string | null> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: "query($id:Int){Media(id:$id){trailer{id site}}}",
        variables: { id: Number(id) },
      }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { Media?: { trailer?: { id: string; site: string } | null } };
    };
    const t = json.data?.Media?.trailer;
    return t && t.site.toLowerCase() === "youtube" ? t.id : null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const getTrailer = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        source: z.enum(["anilist", "tvmaze", "tmdb"]),
        id: z.string().max(40),
        title: z.string().max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ youtubeId: string | null }> => {
    const key = process.env["TMDB_API_KEY"];
    try {
      if (data.source === "anilist") {
        const k = await anilistTrailer(data.id);
        if (k) return { youtubeId: k };
        return {
          youtubeId: key && data.title ? await searchTmdbTrailerWithKey(data.title, key) : null,
        };
      }
      if (!key) return { youtubeId: null };
      if (data.source === "tmdb") {
        const [type, raw] = data.id.split("-") as ["tv" | "movie", string];
        return { youtubeId: await fetchTmdbVideosWithKey(type, raw, key) };
      }
      return { youtubeId: data.title ? await searchTmdbTrailerWithKey(data.title, key) : null };
    } catch (error) {
      console.error("Trailer lookup failed", error);
      return { youtubeId: null };
    }
  });
