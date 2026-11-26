import { Loader2 } from "lucide-react";

export function RouteFallback({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 pt-24 text-center">
      <Loader2 className="size-8 animate-spin text-cerulean" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
