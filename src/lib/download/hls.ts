/** Minimal HLS playlist parsing used by the offline downloader. */

export interface Variant {
  uri: string;
  bandwidth: number;
  resolution?: string;
}

export interface HlsKeyInfo {
  method: "AES-128";
  uri: string;
  iv?: string;
}

export interface MediaPlaylist {
  initSegment: string | null;
  segments: string[];
  encrypted: boolean;
  key?: HlsKeyInfo | null;
  mediaSequence?: number;
}

const resolve = (uri: string, base: string) => {
  if (uri.startsWith("/")) {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : /^https?:\/\//i.test(base)
          ? new URL(base).origin
          : "http://127.0.0.1:3000";
    return `${origin}${uri}`;
  }
  const absBase = /^https?:\/\//i.test(base)
    ? base
    : `${typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://127.0.0.1:3000"}${base.startsWith("/") ? "" : "/"}${base}`;
  return new URL(uri, absBase).toString();
};

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
    // Skip pure audio-only streams that explicitly list only mp4a/ac-3/ec-3/opus with no video codec.
    const isAudioOnly =
      codecs &&
      !/avc1|hvc1|hev1|av01|vp09|vp9|mp4v/i.test(codecs) &&
      /mp4a|ac-3|ec-3|opus/i.test(codecs);
    if (!uri || isAudioOnly) continue;
    variants.push({
      uri: resolve(uri, baseUrl),
      bandwidth: Number(bw ?? 0),
      ...(res ? { resolution: res } : {}),
    });
  }
  return variants.sort((a, b) => a.bandwidth - b.bandwidth);
}

/** Highest-quality variant at or under the cap; lowest if none fit. */
export function pickVariant(variants: Variant[], maxBandwidth = 3_500_000): Variant | null {
  if (!variants.length) return null;
  const fit = variants.filter((v) => v.bandwidth <= maxBandwidth);
  return fit.length ? fit[fit.length - 1]! : variants[0]!;
}

export function parseMediaPlaylist(text: string, baseUrl: string): MediaPlaylist {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let initSegment: string | null = null;
  let encrypted = false;
  let key: HlsKeyInfo | null = null;
  let mediaSequence = 0;
  const segments: string[] = [];

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      const seq = Number(line.slice("#EXT-X-MEDIA-SEQUENCE:".length).trim());
      if (Number.isFinite(seq)) mediaSequence = seq;
    } else if (line.startsWith("#EXT-X-MAP:")) {
      const uri = /URI="([^"]+)"/.exec(line)?.[1];
      if (uri) initSegment = resolve(uri, baseUrl);
    } else if (line.startsWith("#EXT-X-KEY:")) {
      const method = /METHOD=([^,\s]+)/.exec(line)?.[1]?.toUpperCase();
      if (!method || method === "NONE") continue;
      if (method === "AES-128") {
        const uri = /URI="([^"]+)"/.exec(line)?.[1];
        const iv = /IV=0x([0-9a-fA-F]+)/i.exec(line)?.[1];
        if (uri) {
          key = { method: "AES-128", uri: resolve(uri, baseUrl), ...(iv ? { iv } : {}) };
        } else {
          encrypted = true;
        }
      } else {
        encrypted = true;
      }
    } else if (!line.startsWith("#")) {
      segments.push(resolve(line, baseUrl));
    }
  }
  return { initSegment, segments, encrypted, key, mediaSequence };
}
