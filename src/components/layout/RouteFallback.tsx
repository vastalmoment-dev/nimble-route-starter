import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

export function RouteFallback({ label }: { label?: string }) {
  const { t } = useT();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 pt-24 text-center">
      <Loader2 className="size-8 animate-spin text-cerulean" />
      <p className="text-sm text-muted-foreground">{label ?? t("common.loading")}</p>
    </div>
  );
}
