import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Source } from "@/lib/catalog/types";

export function MediaImage({
  src,
  fallbackSrc,
  source,
  itemId,
  alt = "",
  className,
  loading,
  decoding,
  fetchPriority,
  fallback,
}: {
  src: string | null | undefined;
  fallbackSrc?: string | null | undefined;
  source?: Source | undefined;
  itemId?: string | undefined;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager" | undefined;
  decoding?: "async" | "sync" | "auto" | undefined;
  fetchPriority?: "high" | "low" | "auto" | undefined;
  fallback?: ReactNode;
}) {
  const candidates = useMemo(() => {
    const list: string[] = [];
    const push = (u: string | null | undefined) => {
      if (u && !list.includes(u)) list.push(u);
    };
    push(src);
    push(fallbackSrc);
    if (source === "anilist" && itemId) {
      const mirrorParams = new URLSearchParams({ id: itemId });
      if (src) mirrorParams.set("url", src);
      push(`/api/anilast/image?${mirrorParams.toString()}`);
      if (fallbackSrc && fallbackSrc !== src) {
        const secondaryParams = new URLSearchParams({ id: itemId, url: fallbackSrc });
        push(`/api/anilast/image?${secondaryParams.toString()}`);
      }
    }
    return list;
  }, [src, fallbackSrc, source, itemId]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [src, fallbackSrc, itemId]);

  const activeSrc = candidates[idx];
  if (!activeSrc) {
    return <>{fallback ?? null}</>;
  }

  return (
    <img
      src={activeSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      {...(loading ? { loading } : {})}
      {...(decoding ? { decoding } : {})}
      {...(fetchPriority ? { fetchPriority } : {})}
      onError={() => setIdx((current) => current + 1)}
    />
  );
}
