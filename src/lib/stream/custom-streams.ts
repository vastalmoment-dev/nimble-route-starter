/**
 * Licensed / self-hosted stream links, keyed by item key (`${source}:${id}`, e.g. "tmdb:movie-603").
 * Only add URLs you own or are licensed to show. Titles without an entry fall back to the trailer.
 * Direct .m3u8 / .mp4 links play in the built-in player; any other https page loads in the frame.
 */
export const CUSTOM_STREAMS: Record<string, string> = {};

export function customStreamUrl(key: string, fromData?: string | null): string | null {
  const url = fromData || CUSTOM_STREAMS[key];
  return url && /^https:\/\//i.test(url) ? url : null;
}

export const isDirectVideo = (url: string) => /\.(m3u8|mp4)(\?|#|$)/i.test(url);
