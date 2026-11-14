import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function stopTrailer(frame: HTMLIFrameElement | null) {
  if (!frame) return;
  try {
    frame.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "stopVideo", args: [] }), "https://www.youtube-nocookie.com");
  } catch {
    // The iframe window may already be detached during route teardown.
  }
  // Clearing the document also works before YouTube's API has initialized.
  frame.src = "about:blank";
}

export function TrailerFrame({ youtubeId, title, registerStop, playbackLabel = "trailer" }: {
  youtubeId: string;
  title: string;
  registerStop: (stop: () => void) => () => void;
  playbackLabel?: "trailer" | "movie";
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [suspended, setSuspended] = useState(false);
  const stop = useCallback(() => {
    stopTrailer(frame.current);
    setSuspended(true);
  }, []);

  useEffect(() => registerStop(stop), [registerStop, stop]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stop(); };
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", onVisibility);
    const element = frame.current;
    // React may replay effects while mounting; reconnect only an active player.
    if (!suspended && element?.getAttribute("src") === "about:blank") {
      element.src = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&enablejsapi=1`;
    }
    return () => {
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", onVisibility);
      stopTrailer(element);
    };
  }, [stop, suspended, youtubeId]);

  if (suspended) return (
    <div className="flex size-full items-center justify-center">
      <Button variant="glass" size="xl" onClick={() => setSuspended(false)}><Play /> Play {playbackLabel}</Button>
    </div>
  );
  return <iframe
    ref={frame}
    className="size-full"
    src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&enablejsapi=1`}
    title={`${title} ${playbackLabel}`}
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    allowFullScreen
  />;
}