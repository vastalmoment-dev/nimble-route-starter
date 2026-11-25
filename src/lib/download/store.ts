import { useSyncExternalStore } from "react";
import { resolveStream, type StreamRequest } from "@/lib/stream/resolver";
import { downloadStream, safeFilename } from "./downloader";

export type DownloadStatus = "resolving" | "downloading" | "done" | "error" | "cancelled";

export interface DownloadJob {
  id: string;
  title: string;
  status: DownloadStatus;
  progress: number;
  error?: string;
}

let jobs: DownloadJob[] = [];
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const update = (id: string, patch: Partial<DownloadJob>) => {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  emit();
};

export const downloads = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  snapshot: () => jobs,
  async start(req: StreamRequest) {
    const audio = req.audio ?? "sub";
    const includeSubs = Boolean(req.includeSubtitles);
    const seasonTag = req.season && req.mediaType !== "movie" ? `S${req.season}` : "";
    const isMovie = req.mediaType === "movie";
    const subTag = req.source === "anilist" ? (includeSubs ? " + Subs" : " · No Subs") : "";
    const audioTag = req.source === "anilist" ? ` (${audio.toUpperCase()}${subTag})` : "";
    const id = `${req.source}:${req.id}:${req.season ?? 1}:${req.episode}:${audio}:${includeSubs ? "subs" : "nosubs"}`;
    const existing = jobs.find((j) => j.id === id);
    if (existing && (existing.status === "downloading" || existing.status === "resolving")) return;
    const epPart = isMovie ? "Full Movie" : `${seasonTag ? `${seasonTag}·` : ""}Ep ${req.episode}`;
    const title = `${req.title} — ${epPart}${audioTag}`;
    jobs = [{ id, title, status: "resolving", progress: 0 }, ...jobs.filter((j) => j.id !== id)];
    emit();
    const controller = new AbortController();
    controllers.set(id, controller);
    try {
      const stream = await resolveStream(req);
      update(id, { status: "downloading" });
      const filePart = isMovie ? "Movie" : `${seasonTag ? `${seasonTag}_` : ""}E${req.episode}`;
      await downloadStream(stream, {
        filename: safeFilename(
          `${req.title}_${filePart}${req.source === "anilist" ? `_${audio.toUpperCase()}${includeSubs ? "" : "_NoSub"}` : ""}`,
        ),
        includeSubtitles: includeSubs,
        signal: controller.signal,
        onProgress: (p) => update(id, { progress: p }),
      });
      update(id, { status: "done", progress: 1 });
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
  },
  cancel(id: string) {
    controllers.get(id)?.abort();
  },
  dismiss(id: string) {
    jobs = jobs.filter((j) => j.id !== id);
    emit();
  },
};

const EMPTY: DownloadJob[] = [];
export function useDownloads() {
  return useSyncExternalStore(downloads.subscribe, downloads.snapshot, () => EMPTY);
}
