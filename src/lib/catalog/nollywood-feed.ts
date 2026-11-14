// Browser-safe parsing/filtering for official Nollywood channel upload feeds.
export const NOLLYWOOD_CHANNELS = [
  { id: "UCneM4DHHUWMVwmYktz8X46g", name: "Bimbo Ademoye TV" },
  { id: "UCVVs7iCZgDTBi7nPs4m4ksg", name: "Uduak Isong TV" },
  { id: "UCi8vPG6uMxIjoZMhLLX2BkQ", name: "Nollywood Pictures TV" },
  { id: "UCk4722Nm8KAlV1YTpzC-VHA", name: "African Movie Channel" },
  { id: "UCjcFNZE51DmSrGYBqixs0Ug", name: "Ruth Kadiri 247" },
] as const;

export type FeedMovie = {
  youtubeId: string; title: string; channel: string; image: string;
  published: string; views: number; format: string;
};

const EXCLUDE = /\b(teaser|trailer|coming soon|coming to|promo|bts|behind the scenes|interview|skit|#shorts|reaction)\b/i;
const INCLUDE = /\b(movie|film|starring|nollywood|full)\b/i;

export function isFullMovieTitle(title: string): boolean {
  return INCLUDE.test(title) && !EXCLUDE.test(title);
}

function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function cleanTitle(raw: string) {
  const t = raw.split(/\s+(?:-|–|starring)\s+|\.\s+starring/i)[0] ?? raw;
  const tidy = t.replace(/\s*\(the movie\)/i, "").replace(/[.\s]+$/, "").trim();
  return tidy.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) || raw;
}

export function parseFeed(xml: string, channel: string): FeedMovie[] {
  const out: FeedMovie[] = [];
  for (const entry of xml.split("<entry>").slice(1)) {
    const get = (re: RegExp) => entry.match(re)?.[1] ?? "";
    const id = get(/<yt:videoId>([^<]+)</);
    const raw = decode(get(/<title>([^<]*)</));
    const link = get(/<link rel="alternate" href="([^"]+)"/);
    if (!id || link.includes("/shorts/") || !isFullMovieTitle(raw)) continue;
    const part = raw.match(/\b(?:pt|part)\.?\s*(\d+)/i)?.[1];
    out.push({
      youtubeId: id, title: cleanTitle(raw), channel,
      image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      published: get(/<published>([^<]+)</),
      views: Number(get(/views="(\d+)"/)) || 0,
      format: part ? `Part ${part}` : "Full movie",
    });
  }
  return out;
}
