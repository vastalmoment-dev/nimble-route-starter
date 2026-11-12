import { CheckCircle2, Download, Loader2, X, XCircle } from "lucide-react";
import { downloads, useDownloads } from "@/lib/download/store";
import { Progress } from "@/components/ui/progress";

export function DownloadsTray() {
  const jobs = useDownloads();
  if (!jobs.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover/95 shadow-card backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Download className="size-3.5" /> Downloads
      </div>
      <ul className="max-h-72 divide-y overflow-y-auto">
        {jobs.map((job) => {
          const active = job.status === "resolving" || job.status === "downloading";
          return (
            <li key={job.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start gap-2">
                {active && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-cerulean" />}
                {job.status === "done" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-genre-cartoons" />}
                {(job.status === "error" || job.status === "cancelled") && (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{job.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.status === "resolving" && "Finding stream…"}
                    {job.status === "downloading" && `Saving for offline · ${Math.round(job.progress * 100)}%`}
                    {job.status === "done" && "Saved to your device"}
                    {job.status === "cancelled" && "Cancelled"}
                    {job.status === "error" && job.error}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={active ? "Cancel download" : "Dismiss"}
                  className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => (active ? downloads.cancel(job.id) : downloads.dismiss(job.id))}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              {active && <Progress value={job.progress * 100} className="h-1" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
