import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function stopTrailer(frame: HTMLIFrameElement | null) {
  if (!frame) return;
  frame.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "stopVideo", args: [] }), "https://www.youtube-nocookie.com");
  // Clearing the document also works before YouTube's API has initialized.
  frame.src = "about:blank";
}

export function TrailerFrame({ youtubeId, title, registerStop }: {
  youtubeId: string;
  title: string;
  registerStop: (stop: () => void) => () => void;
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
    return () => {
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", onVisibility);
      stopTrailer(element);
    };
  }, [stop, suspended]);

  if (suspended) return (
    <div className="flex size-full items-center justify-center">
      <Button variant="glass" size="xl" onClick={() => setSuspended(false)}><Play /> Play trailer</Button>
    </div>
  );
  return <iframe
    ref={frame}
    className="size-full"
    src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&enablejsapi=1`}
    title={`${title} trailer`}
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    allowFullScreen
  />;
}