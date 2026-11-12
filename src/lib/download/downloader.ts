import type { ResolvedStream } from "@/lib/stream/resolver";
import { isMasterPlaylist, parseMasterPlaylist, parseMediaPlaylist, pickVariant } from "./hls";

export interface DownloadOptions {
  filename: string;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFilename(name: string) {
  return name.replace(/[^\p{L}\p{N}\-_. ]+/gu, "").replace(/\s+/g, "_").slice(0, 80) || "shadow_video";
}

async function fetchText(url: string, signal?: AbortSignal) {
  const res = await fetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`Playlist request failed (${res.status})`);
  return res.text();
}

async function downloadHls(stream: ResolvedStream, opts: DownloadOptions) {
  let playlistUrl = stream.url;
  let text = await fetchText(playlistUrl, opts.signal);
  if (isMasterPlaylist(text)) {
    const variant = pickVariant(parseMasterPlaylist(text, playlistUrl));
    if (!variant) throw new Error("No downloadable video rendition was found.");
    playlistUrl = variant.uri;
    text = await fetchText(playlistUrl, opts.signal);
  }
  const playlist = parseMediaPlaylist(text, playlistUrl);
  if (playlist.encrypted) throw new Error("This stream is encrypted and can't be saved offline.");
  if (!playlist.segments.length) throw new Error("This stream has no segments to download.");

  const urls = [...(playlist.initSegment ? [playlist.initSegment] : []), ...playlist.segments];
  const parts: ArrayBuffer[] = new Array(urls.length);
  let done = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      const res = await fetch(urls[index]!, opts.signal ? { signal: opts.signal } : {});
      if (!res.ok) throw new Error(`Segment ${index + 1} failed (${res.status})`);
      parts[index] = await res.arrayBuffer();
      done++;
      opts.onProgress?.(done / urls.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  const isFmp4 = Boolean(playlist.initSegment) || /\.(m4s|mp4)(\?|$)/i.test(playlist.segments[0] ?? "");
  const blob = new Blob(parts, { type: isFmp4 ? "video/mp4" : "video/mp2t" });
  saveBlob(blob, `${opts.filename}.${isFmp4 ? "mp4" : "ts"}`);
}

async function downloadFile(stream: ResolvedStream, opts: DownloadOptions) {
  try {
    const res = await fetch(stream.url, opts.signal ? { signal: opts.signal } : {});
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
    const total = Number(res.headers.get("content-length") ?? 0);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) opts.onProgress?.(received / total);
    }
    saveBlob(new Blob(chunks as BlobPart[], { type: "video/mp4" }), `${opts.filename}.mp4`);
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    // Cross-origin hosts without CORS: hand the file straight to the browser.
    const a = document.createElement("a");
    a.href = stream.url;
    a.download = `${opts.filename}.mp4`;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
    opts.onProgress?.(1);
  }
}

export function downloadStream(stream: ResolvedStream, opts: DownloadOptions) {
  return stream.type === "hls" ? downloadHls(stream, opts) : downloadFile(stream, opts);
}
