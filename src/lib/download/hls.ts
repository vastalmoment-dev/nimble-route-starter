/** Minimal HLS playlist parsing used by the offline downloader. */

export interface Variant {
  uri: string;
  bandwidth: number;
  resolution?: string;
}

export interface MediaPlaylist {
  initSegment: string | null;
  segments: string[];
  encrypted: boolean;
}

const resolve = (uri: string, base: string) => new URL(uri, base).toString();

export function isMasterPlaylist(text: string): boolean {
  return text.includes("#EXT-X-STREAM-INF");
}

export function parseMasterPlaylist(text: string, baseUrl: string): Variant[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const variants: Variant[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const bw = /BANDWIDTH=(\d+)/.exec(line)?.[1];
    const res = /RESOLUTION=(\d+x\d+)/.exec(line)?.[1];
    const codecs = /CODECS="([^"]+)"/.exec(line)?.[1] ?? "";
    let j = i + 1;
    while (j < lines.length && (lines[j] === "" || lines[j]!.startsWith("#"))) j++;
    const uri = lines[j];
    // Skip audio-only renditions; they have no video codec.
    if (!uri || (codecs && !/avc1|hvc1|hev1|av01|vp09/.test(codecs))) continue;
    variants.push({ uri: resolve(uri, baseUrl), bandwidth: Number(bw ?? 0), ...(res ? { resolution: res } : {}) });
  }
  return variants.sort((a, b) => a.bandwidth - b.bandwidth);
}

/** Highest-quality variant at or under the cap; lowest if none fit. */
export function pickVariant(variants: Variant[], maxBandwidth = 3_000_000): Variant | null {
  if (!variants.length) return null;
  const fit = variants.filter((v) => v.bandwidth <= maxBandwidth);
  return fit.length ? fit[fit.length - 1]! : variants[0]!;
}

export function parseMediaPlaylist(text: string, baseUrl: string): MediaPlaylist {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let initSegment: string | null = null;
  let encrypted = false;
  const segments: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("#EXT-X-MAP:")) {
      const uri = /URI="([^"]+)"/.exec(line)?.[1];
      if (uri) initSegment = resolve(uri, baseUrl);
    } else if (line.startsWith("#EXT-X-KEY:")) {
      if (!/METHOD=NONE/.test(line)) encrypted = true;
    } else if (!line.startsWith("#")) {
      segments.push(resolve(line, baseUrl));
    }
  }
  return { initSegment, segments, encrypted };
}
