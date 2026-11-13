import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";

const WatchReturnContext = createContext<{ current: string | null }>({ current: null });

export function WatchNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const returnTo = useRef<string | null>(null);
  useEffect(() => router.subscribe("onBeforeNavigate", ({ fromLocation, toLocation }) => {
    if (fromLocation && !fromLocation.pathname.startsWith("/watch/") && toLocation.pathname.startsWith("/watch/")) {
      returnTo.current = fromLocation.href;
    }
  }), [router]);
  return <WatchReturnContext.Provider value={returnTo}>{children}</WatchReturnContext.Provider>;
}

export function useWatchReturn() {
  return useContext(WatchReturnContext);
}