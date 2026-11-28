import type { ResolvedStream } from "@/lib/stream/resolver";
import {
  isMasterPlaylist,
  parseAudioTracks,
  parseMasterPlaylist,
  parseMediaPlaylist,
  pickAudioRendition,
  pickVariant,
  type MediaPlaylist,
} from "./hls";
import { triggerBlobDownload } from "./offline-db";
import { muxMpegTsVideoAndAudio } from "./ts-mux";

export interface DownloadOptions {
  filename: string;
  includeSubtitles?: boolean | undefined;
  audio?: "sub" | "dub" | undefined;
  lang?: "en" | "fr" | undefined;
  skipSaveFile?: boolean | undefined;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export interface DownloadedMediaResult {
  blob: Blob;
  ext: string;
  mimeType: string;
  subtitleVtt: string | null;
}

function saveBlob(blob: Blob, filename: string) {
  triggerBlobDownload(blob, filename);
}

export function safeFilename(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N}\-_. ]+/gu, "")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "shadow_video"
  );
}

interface RateCooldown {
  until: number;
}

function parseRetryAfterMs(headerVal: string | null): number {
  if (!headerVal) return 5500;
  const secs = Number(headerVal);
  if (Number.isFinite(secs) && secs >= 0) {
    return Math.min(20_000, Math.max(1500, Math.round(secs * 1000) + 450));
  }
  const dateMs = Date.parse(headerVal);
  if (Number.isFinite(dateMs)) {
    return Math.min(20_000, Math.max(1500, dateMs - Date.now() + 450));
  }
  return 5500;
}

async function waitAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchWithRetry(
  url: string,
  signal?: AbortSignal,
  attempts = 3,
  cooldown?: RateCooldown,
): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (cooldown && cooldown.until > Date.now()) {
      await waitAbortable(cooldown.until - Date.now(), signal);
    }
    try {
      const res = await fetch(url, signal ? { signal } : {});
      if (res.ok) return res;
      if (res.status === 429) {
        const waitMs = parseRetryAfterMs(res.headers.get("retry-after"));
        if (cooldown) cooldown.until = Math.max(cooldown.until, Date.now() + waitMs);
        lastError = new Error(`Request rate-limited (${res.status})`);
        if (i + 1 < attempts) {
          await waitAbortable(waitMs, signal);
          continue;
        }
        throw lastError;
      }
      if (res.status < 500) {
        throw new Error(`Request failed (${res.status})`);
      }
      lastError = new Error(`Request failed (${res.status})`);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
    }
    if (i + 1 < attempts) {
      await waitAbortable(350 * (i + 1), signal);
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

async function fetchMediaSegments(
  playlist: MediaPlaylist,
  opts: {
    signal?: AbortSignal;
    cooldown: RateCooldown;
    onSegmentDone: () => void;
  },
): Promise<ArrayBuffer[]> {
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
  let cursor = 0;
  const seqBase = playlist.mediaSequence ?? 0;

  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      const res = await fetchWithRetry(urls[index]!, opts.signal, 6, opts.cooldown);
      let buf = await res.arrayBuffer();
      if (cryptoKey && (!hasInit || index > 0)) {
        const segSeq = seqBase + (hasInit ? index - 1 : index);
        const iv = buildIv(segSeq, playlist.key?.iv);
        buf = await globalThis.crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, buf);
      }
      parts[index] = buf;
      opts.onSegmentDone();
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return parts;
}

async function downloadHls(
  stream: ResolvedStream,
  opts: DownloadOptions,
): Promise<{ blob: Blob; ext: string; mimeType: string }> {
  let playlistUrl = stream.url;
  let text = await fetchText(playlistUrl, opts.signal);
  let audioPlaylist: MediaPlaylist | null = null;

  if (isMasterPlaylist(text)) {
    const masterText = text;
    const masterUrl = playlistUrl;
    const variant = pickVariant(parseMasterPlaylist(masterText, masterUrl));
    if (!variant) throw new Error("No downloadable video rendition was found.");
    playlistUrl = variant.uri;
    text = await fetchText(playlistUrl, opts.signal);

    const audioTracks = parseAudioTracks(masterText, masterUrl);
    const chosenAudio = pickAudioRendition(audioTracks, {
      groupId: variant.audioGroup,
      audio: opts.audio,
      lang: opts.lang,
    });
    if (chosenAudio) {
      try {
        const audioText = await fetchText(chosenAudio.uri, opts.signal);
        const parsedAudio = parseMediaPlaylist(audioText, chosenAudio.uri);
        if (!parsedAudio.encrypted && parsedAudio.segments.length > 0 && !parsedAudio.initSegment) {
          audioPlaylist = parsedAudio;
        }
      } catch {
        /* fallback cleanly if separate audio playlist is unavailable */
      }
    }
  }
  const playlist = parseMediaPlaylist(text, playlistUrl);
  if (playlist.encrypted)
    throw new Error("This stream uses DRM protection and can't be saved offline.");
  if (!playlist.segments.length) throw new Error("This stream has no segments to download.");

  const isFmp4 =
    Boolean(playlist.initSegment) || /\.(m4s|mp4)(\?|$)/i.test(playlist.segments[0] ?? "");
  const effectiveAudioPlaylist = !isFmp4 ? audioPlaylist : null;

  const totalUnits =
    (playlist.initSegment ? 1 : 0) +
    playlist.segments.length +
    (effectiveAudioPlaylist ? effectiveAudioPlaylist.segments.length : 0);
  const cooldown: RateCooldown = { until: 0 };
  let done = 0;
  const onSegmentDone = () => {
    done++;
    opts.onProgress?.(Math.min(1, done / Math.max(1, totalUnits)));
  };

  const [videoParts, audioParts] = await Promise.all([
    fetchMediaSegments(playlist, {
      ...(opts.signal ? { signal: opts.signal } : {}),
      cooldown,
      onSegmentDone,
    }),
    effectiveAudioPlaylist
      ? fetchMediaSegments(effectiveAudioPlaylist, {
          ...(opts.signal ? { signal: opts.signal } : {}),
          cooldown,
          onSegmentDone,
        })
      : Promise.resolve([] as ArrayBuffer[]),
  ]);

  const finalParts: BlobPart[] =
    audioParts.length > 0 ? muxMpegTsVideoAndAudio(videoParts, audioParts) : videoParts;

  const ext = isFmp4 ? "mp4" : "ts";
  const mimeType = isFmp4 ? "video/mp4" : "video/mp2t";
  const blob = new Blob(finalParts, { type: mimeType });
  if (!opts.skipSaveFile) {
    saveBlob(blob, `${opts.filename}.${ext}`);
  }
  return { blob, ext, mimeType };
}

async function downloadFile(
  stream: ResolvedStream,
  opts: DownloadOptions,
): Promise<{ blob: Blob; ext: string; mimeType: string }> {
  const res = await fetchWithRetry(stream.url, opts.signal, 2);
  const mimeType = "video/mp4";
  if (!res.body) {
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf], { type: mimeType });
    if (!opts.skipSaveFile) saveBlob(blob, `${opts.filename}.mp4`);
    opts.onProgress?.(1);
    return { blob, ext: "mp4", mimeType };
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
  const blob = new Blob(chunks as BlobPart[], { type: mimeType });
  if (!opts.skipSaveFile) saveBlob(blob, `${opts.filename}.mp4`);
  opts.onProgress?.(1);
  return { blob, ext: "mp4", mimeType };
}

async function maybeDownloadSubtitle(
  stream: ResolvedStream,
  opts: DownloadOptions,
): Promise<string | null> {
  if (!opts.includeSubtitles || !stream.subtitles?.length) return null;
  const targetLang = opts.lang ?? "en";
  const matchesTarget = (s: { lang: string; label: string }) =>
    targetLang === "fr"
      ? s.lang.toLowerCase().startsWith("fr") || /french|français/i.test(s.label)
      : s.lang.toLowerCase().startsWith("en") || /english/i.test(s.label);
  const ordered = [
    ...stream.subtitles.filter(matchesTarget),
    ...stream.subtitles.filter((s) => !matchesTarget(s)),
  ];
  for (const candidate of ordered) {
    try {
      const res = await fetchWithRetry(candidate.url, opts.signal, 2);
      const vtt = await res.text();
      if (!vtt.trim() || /^\s*(<!doctype|<html\b)/i.test(vtt)) continue;
      if (!opts.skipSaveFile) {
        saveBlob(new Blob([vtt], { type: "text/vtt; charset=utf-8" }), `${opts.filename}.vtt`);
      }
      return vtt;
    } catch {
      /* try next subtitle candidate */
    }
  }
  return null;
}

export async function downloadStream(
  stream: ResolvedStream,
  opts: DownloadOptions,
): Promise<DownloadedMediaResult> {
  const video = await (stream.type === "hls"
    ? downloadHls(stream, opts)
    : downloadFile(stream, opts));
  const subtitleVtt = await maybeDownloadSubtitle(stream, opts);
  return { ...video, subtitleVtt };
}
