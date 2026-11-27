import { useRouter } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";

export interface ReturnLocationTarget {
  href: string;
  pathname: string;
  search: Record<string, unknown>;
}

interface WatchReturnContextValue {
  current: string | null;
  getReturnTarget: () => ReturnLocationTarget | null;
  requestScrollRestore: (href: string) => void;
}

const STORAGE_KEY = "shadow:watch-return:v1";

function isBrowsePath(pathname: string): boolean {
  return !pathname.startsWith("/watch/") && !pathname.startsWith("/title/");
}

function writeSessionReturn(target: ReturnLocationTarget | null, scrollY: number) {
  if (typeof window === "undefined") return;
  try {
    if (!target) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ target, scrollY }));
  } catch {
    /* ignore sessionStorage restrictions */
  }
}

function readSessionReturn(): { target: ReturnLocationTarget; scrollY: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      target?: ReturnLocationTarget;
      scrollY?: number;
    } | null;
    if (!parsed?.target?.href || !parsed.target.pathname) return null;
    return {
      target: parsed.target,
      scrollY: typeof parsed.scrollY === "number" && parsed.scrollY > 0 ? parsed.scrollY : 0,
    };
  } catch {
    return null;
  }
}

const WatchReturnContext = createContext<WatchReturnContextValue>({
  current: null,
  getReturnTarget: () => null,
  requestScrollRestore: () => {},
});

export function WatchNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const returnToRef = useRef<string | null>(null);
  const returnTargetRef = useRef<ReturnLocationTarget | null>(null);
  const scrollMapRef = useRef<Map<string, number>>(new Map());
  const pendingRestoreRef = useRef<{ href: string; y: number } | null>(null);

  // Hydrate return target only when reloading/starting directly inside /title/ or /watch/ with prior session state
  useEffect(() => {
    const currentPath = router.state.location.pathname;
    if (!isBrowsePath(currentPath) && !returnTargetRef.current) {
      const saved = readSessionReturn();
      if (saved) {
        returnTargetRef.current = saved.target;
        returnToRef.current = saved.target.href;
        scrollMapRef.current.set(saved.target.href, saved.scrollY);
      }
    }
  }, [router]);

  // Track active browse page scrollY continuously while scrolling
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => {
      const loc = router.state.location;
      if (isBrowsePath(loc.pathname)) {
        scrollMapRef.current.set(loc.href, window.scrollY);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [router]);

  const requestScrollRestore = useCallback((href: string) => {
    const y = scrollMapRef.current.get(href) ?? 0;
    if (y > 0) {
      pendingRestoreRef.current = { href, y };
    }
  }, []);

  useEffect(() => {
    let cancelTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;

    const clearRestoreWatch = () => {
      if (cancelTimer) {
        clearTimeout(cancelTimer);
        cancelTimer = null;
      }
      if (rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const unsubBefore = router.subscribe(
      "onBeforeNavigate",
      ({ fromLocation, toLocation, pathChanged }) => {
        if (!fromLocation || !toLocation) return;
        const fromBrowse = isBrowsePath(fromLocation.pathname);
        const toDetailOrWatch = !isBrowsePath(toLocation.pathname);

        if (fromBrowse && toDetailOrWatch) {
          const y =
            typeof window !== "undefined"
              ? Math.max(window.scrollY, scrollMapRef.current.get(fromLocation.href) ?? 0)
              : 0;
          scrollMapRef.current.set(fromLocation.href, y);
          const target: ReturnLocationTarget = {
            href: fromLocation.href,
            pathname: fromLocation.pathname,
            search: (fromLocation.search as Record<string, unknown> | undefined) ?? {},
          };
          returnTargetRef.current = target;
          returnToRef.current = fromLocation.href;
          writeSessionReturn(target, y);
          return;
        }

        // Browser back button / popstate returning directly to the remembered browse page
        if (
          !fromBrowse &&
          isBrowsePath(toLocation.pathname) &&
          !pendingRestoreRef.current &&
          returnTargetRef.current?.href === toLocation.href
        ) {
          const savedY = scrollMapRef.current.get(toLocation.href) ?? 0;
          if (savedY > 0) {
            pendingRestoreRef.current = { href: toLocation.href, y: savedY };
          }
        }

        // Moving to a different top-level browse route clears stale watch return
        if (fromBrowse && isBrowsePath(toLocation.pathname) && pathChanged) {
          returnTargetRef.current = null;
          returnToRef.current = null;
          writeSessionReturn(null, 0);
        }
      },
    );

    const unsubResolved = router.subscribe("onResolved", ({ toLocation }) => {
      const pending = pendingRestoreRef.current;
      if (!pending || pending.href !== toLocation.href) {
        if (isBrowsePath(toLocation.pathname)) {
          writeSessionReturn(null, 0);
        }
        return;
      }

      pendingRestoreRef.current = null;
      writeSessionReturn(null, 0);
      const targetY = pending.y;
      if (targetY <= 0 || typeof window === "undefined") return;

      clearRestoreWatch();
      const startedAt = Date.now();

      const attemptScroll = () => {
        const docHeight = document.documentElement.scrollHeight;
        if (docHeight >= targetY + Math.min(240, window.innerHeight * 0.4)) {
          try {
            window.scrollTo({ top: targetY, behavior: "instant" as ScrollBehavior });
          } catch {
            /* ignore unsupported scrollTo in test environments */
          }
          clearRestoreWatch();
          return;
        }
        if (Date.now() - startedAt < 1800) {
          rafId = requestAnimationFrame(attemptScroll);
        } else {
          try {
            window.scrollTo({ top: targetY, behavior: "instant" as ScrollBehavior });
          } catch {
            /* ignore */
          }
        }
      };

      if (typeof requestAnimationFrame === "function") {
        rafId = requestAnimationFrame(attemptScroll);
      }
      cancelTimer = setTimeout(clearRestoreWatch, 2000);
    });

    return () => {
      unsubBefore();
      unsubResolved();
      clearRestoreWatch();
    };
  }, [router]);

  const ctxValue: WatchReturnContextValue = {
    get current() {
      return returnToRef.current;
    },
    getReturnTarget: () => returnTargetRef.current,
    requestScrollRestore,
  };

  return <WatchReturnContext.Provider value={ctxValue}>{children}</WatchReturnContext.Provider>;
}

export function useWatchReturn() {
  return useContext(WatchReturnContext);
}
