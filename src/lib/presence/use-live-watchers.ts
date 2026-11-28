import { useEffect, useState } from "react";

const SESSION_KEY = "shadow:presence-session";
const HEARTBEAT_INTERVAL_MS = 15_000;

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr-session";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing && /^[a-z0-9_-]{6,96}$/i.test(existing)) return existing;
    const generated =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_KEY, generated);
    return generated;
  } catch {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function useLiveWatchers(showKey: string | null | undefined): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!showKey || typeof window === "undefined") {
      setCount(null);
      return;
    }

    const sessionId = getOrCreateSessionId();
    let cancelled = false;
    let channel: BroadcastChannel | null = null;

    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(`shadow:presence:${showKey}`);
      } catch {
        channel = null;
      }
    }

    const sendHeartbeat = async () => {
      try {
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ showKey, sessionId, action: "heartbeat" }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { ok?: boolean; count?: number };
        if (!cancelled && json.ok && typeof json.count === "number") {
          setCount(json.count);
        }
      } catch {
        /* ignore transient offline heartbeat */
      }
    };

    const sendLeave = () => {
      const payload = JSON.stringify({ showKey, sessionId, action: "leave" });
      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const sent = navigator.sendBeacon(
            "/api/presence",
            new Blob([payload], { type: "application/json" }),
          );
          if (sent) return;
        }
      } catch {
        /* fallback to keepalive fetch */
      }
      try {
        void fetch("/api/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {
          /* ignore network/relative-URL teardown errors */
        });
      } catch {
        /* ignore */
      }
    };

    if (channel) {
      channel.onmessage = () => {
        void sendHeartbeat();
      };
      try {
        channel.postMessage({ type: "join", sessionId });
      } catch {
        /* ignore */
      }
    }

    void sendHeartbeat();
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) void sendHeartbeat();
    };
    const onPageHide = () => {
      sendLeave();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (channel) {
        try {
          channel.postMessage({ type: "leave", sessionId });
          channel.close();
        } catch {
          /* ignore */
        }
      }
      sendLeave();
    };
  }, [showKey]);

  return count;
}
