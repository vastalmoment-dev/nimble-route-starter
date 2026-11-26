import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MediaItem } from "@/lib/catalog/types";

const LazyMediaDetailDialog = lazy(() =>
  import("./MediaDetailDialog").then((m) => ({ default: m.MediaDetailDialog })),
);

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
      {item && (
        <Suspense fallback={null}>
          <LazyMediaDetailDialog item={item} onClose={close} />
        </Suspense>
      )}
    </MediaModalContext.Provider>
  );
}

export function useMediaModal() {
  const ctx = useContext(MediaModalContext);
  if (!ctx) throw new Error("useMediaModal must be used inside MediaModalProvider");
  return ctx;
}
