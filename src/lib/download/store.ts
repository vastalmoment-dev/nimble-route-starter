import { useSyncExternalStore } from "react";
import { siteLanguage } from "@/lib/i18n/language";
import { resolveStream, type StreamRequest } from "@/lib/stream/resolver";
import { downloadStream, safeFilename } from "./downloader";
import { offlineLibrary } from "./offline-db";

export type DownloadStatus =
  "queued" | "resolving" | "downloading" | "done" | "error" | "cancelled";

export interface DownloadJob {
  id: string;
  offlineId?: string;
  title: string;
  status: DownloadStatus;
  progress: number;
  error?: string;
}

let jobs: DownloadJob[] = [];
const controllers = new Map<string, AbortController>();
const cancelledQueued = new Set<string>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const update = (id: string, patch: Partial<DownloadJob>) => {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  emit();
};

function buildJobMeta(req: StreamRequest) {
  const audio = req.audio ?? "sub";
  const lang = req.lang ?? siteLanguage.get();
  const isAnime = Boolean(req.isAnime || req.source === "anilist" || req.anilistId);
  const includeSubs = Boolean(req.includeSubtitles);
  const seasonTag = req.season && req.mediaType !== "movie" ? `S${req.season}` : "";
  const isMovie = req.mediaType === "movie";
  const subTag = isAnime ? (includeSubs ? " + Subs" : " · No Subs") : "";
  const audioTag = isAnime ? ` (${audio.toUpperCase()}${subTag})` : lang === "fr" ? " (FR)" : "";
  const id = `${req.source}:${req.id}:${req.season ?? 1}:${req.episode}:${audio}:${lang}:${includeSubs ? "subs" : "nosubs"}`;
  const offlineId = offlineLibrary.buildId({
    source: req.source,
    id: req.id,
    season: req.season ?? 1,
    episode: req.episode,
    audio,
    lang,
  });
  const epPart = isMovie ? "Full Movie" : `${seasonTag ? `${seasonTag}·` : ""}Ep ${req.episode}`;
  const title = `${req.title} — ${epPart}${audioTag}`;
  return { id, offlineId, title, audio, lang, includeSubs, seasonTag, isMovie, isAnime };
}

async function runDownload(req: StreamRequest & { poster?: string | null }) {
  const { id, offlineId, title, audio, lang, includeSubs, seasonTag, isMovie, isAnime } =
    buildJobMeta(req);
  if (cancelledQueued.delete(id)) {
    update(id, { status: "cancelled" });
    return;
  }
  const existing = jobs.find((j) => j.id === id);
  if (existing && (existing.status === "downloading" || existing.status === "resolving")) return;
  jobs = [
    { id, offlineId, title, status: "resolving", progress: 0 },
    ...jobs.filter((j) => j.id !== id),
  ];
  emit();
  const controller = new AbortController();
  controllers.set(id, controller);
  try {
    const stream = await resolveStream({ ...req, lang, isAnime });
    update(id, { status: "downloading" });
    const filePart = isMovie ? "Movie" : `${seasonTag ? `${seasonTag}_` : ""}E${req.episode}`;
    const filename = safeFilename(
      `${req.title}_${filePart}${isAnime ? `_${audio.toUpperCase()}${includeSubs ? "" : "_NoSub"}` : lang === "fr" ? "_FR" : ""}`,
    );
    const candidates =
      stream.sources && stream.sources.length > 0
        ? stream.sources.map((src) => ({
            ...stream,
            url: src.url,
            type: src.type,
          }))
        : [stream];

    let lastErr: unknown = null;
    let downloaded: Awaited<ReturnType<typeof downloadStream>> | null = null;
    for (const candidate of candidates) {
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        update(id, { progress: 0 });
        downloaded = await downloadStream(candidate, {
          filename,
          includeSubtitles: includeSubs,
          lang,
          signal: controller.signal,
          onProgress: (p) => update(id, { progress: p }),
        });
        break;
      } catch (err) {
        if (controller.signal.aborted) throw err;
        lastErr = err;
      }
    }
    if (!downloaded) {
      throw lastErr instanceof Error ? lastErr : new Error("Download failed");
    }
    await offlineLibrary
      .save({
        id: offlineId,
        source: req.source,
        itemId: req.id,
        season: req.season ?? 1,
        episode: req.episode,
        audio,
        lang,
        title: req.title,
        poster: req.poster ?? null,
        mediaType: req.mediaType,
        filename,
        ext: downloaded.ext,
        mimeType: downloaded.mimeType,
        byteSize: downloaded.blob.size,
        savedAt: Date.now(),
        videoBlob: downloaded.blob,
        subtitleVtt: downloaded.subtitleVtt,
      })
      .catch(() => false);
    update(id, { status: "done", progress: 1, offlineId });
  } catch (error) {
    if (controller.signal.aborted) update(id, { status: "cancelled" });
    else
      update(id, {
        status: "error",
        error: error instanceof Error ? error.message : "Download failed",
      });
  } finally {
    controllers.delete(id);
  }
}

export type DownloadRequest = StreamRequest & { poster?: string | null };

export const downloads = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  snapshot: () => jobs,
  async start(req: DownloadRequest) {
    await runDownload(req);
  },
  async startBatch(requests: DownloadRequest[], concurrency = 2) {
    if (!requests.length) return;
    const uniqueReqs: DownloadRequest[] = [];
    const queuedEntries: DownloadJob[] = [];
    const seenIds = new Set<string>();

    for (const req of requests) {
      const { id, offlineId, title } = buildJobMeta(req);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const existing = jobs.find((j) => j.id === id);
      if (
        existing &&
        (existing.status === "queued" ||
          existing.status === "resolving" ||
          existing.status === "downloading")
      ) {
        continue;
      }
      cancelledQueued.delete(id);
      uniqueReqs.push(req);
      queuedEntries.push({ id, offlineId, title, status: "queued", progress: 0 });
    }

    if (!uniqueReqs.length) return;
    jobs = [...queuedEntries, ...jobs.filter((j) => !seenIds.has(j.id))];
    emit();

    let cursor = 0;
    const workerCount = Math.min(Math.max(1, concurrency), uniqueReqs.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < uniqueReqs.length) {
        const idx = cursor++;
        await runDownload(uniqueReqs[idx]!);
      }
    });
    await Promise.all(workers);
  },
  cancel(id: string) {
    const active = controllers.get(id);
    if (active) {
      active.abort();
      return;
    }
    const job = jobs.find((j) => j.id === id);
    if (job?.status === "queued") {
      cancelledQueued.add(id);
      update(id, { status: "cancelled" });
    }
  },
  dismiss(id: string) {
    cancelledQueued.delete(id);
    jobs = jobs.filter((j) => j.id !== id);
    emit();
  },
};

const EMPTY: DownloadJob[] = [];
export function useDownloads() {
  return useSyncExternalStore(downloads.subscribe, downloads.snapshot, () => EMPTY);
}
