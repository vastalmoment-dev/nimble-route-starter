import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { MediaItem } from "@/lib/catalog/types";
import { MediaDetailDialog } from "./MediaDetailDialog";

interface Ctx {
  open: (item: MediaItem) => void;
  close: () => void;
}

const MediaModalContext = createContext<Ctx | null>(null);

export function MediaModalProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<MediaItem | null>(null);
  const open = useCallback((i: MediaItem) => setItem(i), []);
  const close = useCallback(() => setItem(null), []);
  const value = useMemo(() => ({ open, close }), [open, close]);
  return (
    <MediaModalContext.Provider value={value}>
      {children}
      <MediaDetailDialog item={item} onClose={close} />
    </MediaModalContext.Provider>
  );
}

export function useMediaModal() {
  const ctx = useContext(MediaModalContext);
  if (!ctx) throw new Error("useMediaModal must be used inside MediaModalProvider");
  return ctx;
}
