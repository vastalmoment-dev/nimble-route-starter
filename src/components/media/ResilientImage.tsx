import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src?: string | null | undefined;
  alternatives?: (string | null | undefined)[];
  fallbackLabel: string;
};

export function ResilientImage({ src, alternatives = [], fallbackLabel, className, ...props }: Props) {
  const sources = [...new Set([src, ...alternatives].filter((url): url is string => Boolean(url)))];
  // Track failures by URL, so recycled cards can display new artwork immediately.
  const [failed, setFailed] = useState<string[]>([]);
  const current = sources.find((url) => !failed.includes(url));
  if (!current) return (
    <div role="img" aria-label={fallbackLabel} className={cn(className, "flex items-center justify-center bg-surface p-3 text-center font-display text-sm text-muted-foreground")}>
      {fallbackLabel}
    </div>
  );
  return <img {...props} src={current} className={className} onError={() => setFailed((previous) => [...previous, current])} />;
}