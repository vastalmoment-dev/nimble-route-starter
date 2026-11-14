import { createServerFn } from "@tanstack/react-start";
import { NOLLYWOOD_CHANNELS, parseFeed, type FeedMovie } from "./nollywood-feed";

// Reads each official channel's public upload feed, so new uploads appear automatically.
export const getNollywoodUploads = createServerFn({ method: "GET" }).handler(async (): Promise<FeedMovie[]> => {
  const lists = await Promise.all(NOLLYWOOD_CHANNELS.map(async (c) => {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${c.id}`);
      if (!res.ok) { console.error(`Nollywood feed ${c.name} [${res.status}]`); return []; }
      return parseFeed(await res.text(), c.name);
    } catch (e) { console.error(`Nollywood feed ${c.name} failed`, e); return []; }
  }));
  const seen = new Set<string>();
  return lists.flat().filter((m) => !seen.has(m.youtubeId) && seen.add(m.youtubeId))
    .sort((a, b) => b.published.localeCompare(a.published));
});
