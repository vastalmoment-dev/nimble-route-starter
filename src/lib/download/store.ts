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
    const id = `${req.source}:${req.id}:${req.episode}`;
    const existing = jobs.find((j) => j.id === id);
    if (existing && (existing.status === "downloading" || existing.status === "resolving")) return;
    const title = `${req.title} — Ep ${req.episode}`;
    jobs = [{ id, title, status: "resolving", progress: 0 }, ...jobs.filter((j) => j.id !== id)];
    emit();
    const controller = new AbortController();
    controllers.set(id, controller);
    try {
      const stream = await resolveStream(req);
      update(id, { status: "downloading" });
      await downloadStream(stream, {
        filename: safeFilename(`${req.title}_E${req.episode}`),
        signal: controller.signal,
        onProgress: (p) => update(id, { progress: p }),
      });
      update(id, { status: "done", progress: 1 });
    } catch (error) {
      if (controller.signal.aborted) update(id, { status: "cancelled" });
      else update(id, { status: "error", error: error instanceof Error ? error.message : "Download failed" });
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
