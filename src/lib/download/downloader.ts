import type { ResolvedStream } from "@/lib/stream/resolver";
import { isMasterPlaylist, parseMasterPlaylist, parseMediaPlaylist, pickVariant } from "./hls";

export interface DownloadOptions {
  filename: string;
  includeSubtitles?: boolean | undefined;
  lang?: "en" | "fr" | undefined;
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
  return (
    name
      .replace(/[^\p{L}\p{N}\-_. ]+/gu, "")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "shadow_video"
  );
}

async function fetchWithRetry(url: string, signal?: AbortSignal, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const res = await fetch(url, signal ? { signal } : {});
      if (res.ok) return res;
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`Request failed (${res.status})`);
      }
      lastError = new Error(`Request failed (${res.status})`);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
    if (i + 1 < attempts) {
      await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Download failed");
}

async function fetchText(url: string, signal?: AbortSignal) {
  const res = await fetchWithRetry(url, signal, 3);
  return res.text();
}

function buildIv(sequenceNumber: number, hexIv?: string): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(new ArrayBuffer(16));
  if (hexIv) {
    const padded = hexIv.padStart(32, "0").slice(-32);
    for (let i = 0; i < 16; i++) {
      iv[i] = Number.parseInt(padded.slice(i * 2, i * 2 + 2), 16);
    }
    return iv;
  }
  const view = new DataView(iv.buffer);
  view.setUint32(12, sequenceNumber >>> 0, false);
  return iv;
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
  if (playlist.encrypted)
    throw new Error("This stream uses DRM protection and can't be saved offline.");
  if (!playlist.segments.length) throw new Error("This stream has no segments to download.");

  let cryptoKey: CryptoKey | null = null;
  if (playlist.key?.method === "AES-128") {
    const keyRes = await fetchWithRetry(playlist.key.uri, opts.signal, 3);
    const keyBytes = await keyRes.arrayBuffer();
    cryptoKey = await globalThis.crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-CBC" },
      false,
      ["decrypt"],
    );
  }

  const hasInit = Boolean(playlist.initSegment);
  const urls = [...(playlist.initSegment ? [playlist.initSegment] : []), ...playlist.segments];
  const parts: ArrayBuffer[] = new Array(urls.length);
  let done = 0;
  let cursor = 0;
  const seqBase = playlist.mediaSequence ?? 0;

  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      const res = await fetchWithRetry(urls[index]!, opts.signal, 3);
      let buf = await res.arrayBuffer();
      if (cryptoKey && (!hasInit || index > 0)) {
        const segSeq = seqBase + (hasInit ? index - 1 : index);
        const iv = buildIv(segSeq, playlist.key?.iv);
        buf = await globalThis.crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, buf);
      }
      parts[index] = buf;
      done++;
      opts.onProgress?.(done / urls.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  const isFmp4 =
    Boolean(playlist.initSegment) || /\.(m4s|mp4)(\?|$)/i.test(playlist.segments[0] ?? "");
  const blob = new Blob(parts, { type: isFmp4 ? "video/mp4" : "video/mp2t" });
  saveBlob(blob, `${opts.filename}.${isFmp4 ? "mp4" : "ts"}`);
}

async function downloadFile(stream: ResolvedStream, opts: DownloadOptions) {
  const res = await fetchWithRetry(stream.url, opts.signal, 2);
  if (!res.body) {
    const buf = await res.arrayBuffer();
    saveBlob(new Blob([buf], { type: "video/mp4" }), `${opts.filename}.mp4`);
    opts.onProgress?.(1);
    return;
  }
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
  opts.onProgress?.(1);
}

async function maybeDownloadSubtitle(stream: ResolvedStream, opts: DownloadOptions) {
  if (!opts.includeSubtitles || !stream.subtitles?.length) return;
  const targetLang = opts.lang ?? "en";
  const preferred =
    stream.subtitles.find((s) =>
      targetLang === "fr"
        ? s.lang.toLowerCase().startsWith("fr") || /french|français/i.test(s.label)
        : s.lang.toLowerCase().startsWith("en") || /english/i.test(s.label),
    ) ?? stream.subtitles[0];
  if (!preferred) return;
  try {
    const res = await fetchWithRetry(preferred.url, opts.signal, 2);
    const vtt = await res.text();
    if (!vtt.trim()) return;
    saveBlob(new Blob([vtt], { type: "text/vtt; charset=utf-8" }), `${opts.filename}.vtt`);
  } catch {
    /* subtitle download is optional */
  }
}

export async function downloadStream(stream: ResolvedStream, opts: DownloadOptions) {
  await (stream.type === "hls" ? downloadHls(stream, opts) : downloadFile(stream, opts));
  await maybeDownloadSubtitle(stream, opts);
}
