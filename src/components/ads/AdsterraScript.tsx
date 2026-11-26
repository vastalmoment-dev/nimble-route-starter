import { useEffect } from "react";

const ADSTERRA_SRC = "https://abscloud.org/1/36ab3dcb9658b1a279bded157b344c72";
const SCRIPT_ID = "shadow-adsterra-loader";

/**
 * Loads the Adsterra tag politely after initial render/dwell only while browsing,
 * never inside the active `/watch/*` video player so playback stays uninterrupted.
 */
export function AdsterraScript({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    if (document.getElementById(SCRIPT_ID)) return;

    const timer = window.setTimeout(() => {
      if (document.getElementById(SCRIPT_ID)) return;
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.setAttribute("data-cfasync", "false");
      script.async = true;
      script.src = ADSTERRA_SRC;
      document.body.appendChild(script);
    }, 5500);

    return () => window.clearTimeout(timer);
  }, [enabled]);

  return null;
}
