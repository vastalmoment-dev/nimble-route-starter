import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Finds an official YouTube trailer for a title. TMDB key stays on the server. */

type Video = { key: string; site: string; type: string; official?: boolean };

function tmdb(path: string, key: string) {
  const bearer = key.startsWith("eyJ");
  const url = `https://api.themoviedb.org/3${path}${path.includes("?") ? "&" : "?"}${bearer ? "" : `api_key=${key}`}`;
  return fetch(url, { headers: bearer ? { Authorization: `Bearer ${key}`, Accept: "application/json" } : { Accept: "application/json" } });
}

async function tmdbVideos(type: "tv" | "movie", id: string, key: string): Promise<string | null> {
  const res = await tmdb(`/${type}/${id}/videos`, key);
  if (!res.ok) return null;
  const { results } = (await res.json()) as { results: Video[] };
  const yt = results.filter((v) => v.site === "YouTube");
  const pick =
    yt.find((v) => v.type === "Trailer" && v.official) ?? yt.find((v) => v.type === "Trailer") ?? yt.find((v) => v.type === "Teaser") ?? yt[0];
  return pick?.key ?? null;
}

async function tmdbSearch(title: string, key: string): Promise<string | null> {
  for (const type of ["tv", "movie"] as const) {
    const res = await tmdb(`/search/${type}?query=${encodeURIComponent(title)}`, key);
    if (!res.ok) continue;
    const { results } = (await res.json()) as { results: { id: number }[] };
    const first = results[0];
    if (first) {
      const k = await tmdbVideos(type, String(first.id), key);
      if (k) return k;
    }
  }
  return null;
}

async function anilistTrailer(id: string): Promise<string | null> {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query: "query($id:Int){Media(id:$id){trailer{id site}}}", variables: { id: Number(id) } }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { Media?: { trailer?: { id: string; site: string } | null } } };
  const t = json.data?.Media?.trailer;
  return t && t.site.toLowerCase() === "youtube" ? t.id : null;
}

export const getTrailer = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ source: z.enum(["anilist", "tvmaze", "tmdb"]), id: z.string().max(40), title: z.string().max(200) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ youtubeId: string | null }> => {
    const key = process.env["TMDB_API_KEY"];
    try {
      if (data.source === "anilist") {
        const k = await anilistTrailer(data.id);
        if (k) return { youtubeId: k };
        return { youtubeId: key && data.title ? await tmdbSearch(data.title, key) : null };
      }
      if (!key) return { youtubeId: null };
      if (data.source === "tmdb") {
        const [type, raw] = data.id.split("-") as ["tv" | "movie", string];
        return { youtubeId: await tmdbVideos(type, raw, key) };
      }
      return { youtubeId: data.title ? await tmdbSearch(data.title, key) : null };
    } catch (error) {
      console.error("Trailer lookup failed", error);
      return { youtubeId: null };
    }
  });
