import { useSyncExternalStore } from "react";
import { siteLanguage } from "@/lib/i18n/language";
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
    const lang = req.lang ?? siteLanguage.get();
    const includeSubs = Boolean(req.includeSubtitles);
    const seasonTag = req.season && req.mediaType !== "movie" ? `S${req.season}` : "";
    const isMovie = req.mediaType === "movie";
    const subTag = req.source === "anilist" ? (includeSubs ? " + Subs" : " · No Subs") : "";
    const audioTag =
      req.source === "anilist"
        ? ` (${audio.toUpperCase()}${subTag})`
        : lang === "fr"
          ? " (FR)"
          : "";
    const id = `${req.source}:${req.id}:${req.season ?? 1}:${req.episode}:${audio}:${lang}:${includeSubs ? "subs" : "nosubs"}`;
    const existing = jobs.find((j) => j.id === id);
    if (existing && (existing.status === "downloading" || existing.status === "resolving")) return;
    const epPart = isMovie ? "Full Movie" : `${seasonTag ? `${seasonTag}·` : ""}Ep ${req.episode}`;
    const title = `${req.title} — ${epPart}${audioTag}`;
    jobs = [{ id, title, status: "resolving", progress: 0 }, ...jobs.filter((j) => j.id !== id)];
    emit();
    const controller = new AbortController();
    controllers.set(id, controller);
    try {
      const stream = await resolveStream({ ...req, lang });
      update(id, { status: "downloading" });
      const filePart = isMovie ? "Movie" : `${seasonTag ? `${seasonTag}_` : ""}E${req.episode}`;
      const filename = safeFilename(
        `${req.title}_${filePart}${req.source === "anilist" ? `_${audio.toUpperCase()}${includeSubs ? "" : "_NoSub"}` : lang === "fr" ? "_FR" : ""}`,
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
      let succeeded = false;
      for (const candidate of candidates) {
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        try {
          update(id, { progress: 0 });
          await downloadStream(candidate, {
            filename,
            includeSubtitles: includeSubs,
            lang,
            signal: controller.signal,
            onProgress: (p) => update(id, { progress: p }),
          });
          succeeded = true;
          break;
        } catch (err) {
          if (controller.signal.aborted) throw err;
          lastErr = err;
        }
      }
      if (!succeeded) {
        throw lastErr instanceof Error ? lastErr : new Error("Download failed");
      }
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
