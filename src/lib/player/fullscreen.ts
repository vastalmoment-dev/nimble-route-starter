import { useCallback, useEffect, useState, type RefObject } from "react";

export type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

export type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export type WebkitVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
};

export type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait" | "any") => Promise<void>;
  unlock?: () => void;
};

export function getFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function unlockScreenOrientation(): void {
  try {
    const orientation = (typeof screen !== "undefined" ? screen.orientation : undefined) as
      LockableOrientation | undefined;
    orientation?.unlock?.();
  } catch {
    /* ignore unsupported browsers */
  }
}

export async function lockLandscapeScreenOrientation(): Promise<void> {
  try {
    const orientation = (typeof screen !== "undefined" ? screen.orientation : undefined) as
      LockableOrientation | undefined;
    if (orientation?.lock) {
      await orientation.lock("landscape");
    }
  } catch {
    /* desktop or iOS Safari restricts orientation.lock — safely ignored */
  }
}

export async function enterLandscapeFullscreen(
  container: HTMLElement | null,
  video?: HTMLVideoElement | null,
): Promise<boolean> {
  const el = container as FullscreenElement | null;
  const v = video as WebkitVideoElement | null;
  let entered = false;

  if (el) {
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        entered = true;
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
        entered = true;
      }
    } catch {
      /* fallback to iOS native video fullscreen below */
    }
  }

  if (!entered && v?.webkitEnterFullscreen) {
    try {
      v.webkitEnterFullscreen();
      entered = true;
    } catch {
      /* ignore */
    }
  }

  if (entered) {
    await lockLandscapeScreenOrientation();
  }
  return entered;
}

export async function exitLandscapeFullscreen(): Promise<void> {
  unlockScreenOrientation();
  if (typeof document === "undefined") return;
  const doc = document as FullscreenDocument;
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
  } catch {
    /* ignore */
  }
}

export function useLandscapeFullscreen(
  containerRef: RefObject<HTMLElement | null>,
  videoRef?: RefObject<HTMLVideoElement | null>,
) {
  const [fullscreen, setFullscreen] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    if (getFullscreenElement()) {
      await exitLandscapeFullscreen();
      return;
    }
    await enterLandscapeFullscreen(containerRef.current, videoRef?.current);
  }, [containerRef, videoRef]);

  useEffect(() => {
    const v = videoRef?.current ?? null;
    const onFs = () => {
      const fs = Boolean(getFullscreenElement());
      setFullscreen(fs);
      if (!fs) unlockScreenOrientation();
    };
    const onWebkitBegin = () => {
      setFullscreen(true);
      void lockLandscapeScreenOrientation();
    };
    const onWebkitEnd = () => {
      setFullscreen(false);
      unlockScreenOrientation();
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    v?.addEventListener("webkitbeginfullscreen", onWebkitBegin);
    v?.addEventListener("webkitendfullscreen", onWebkitEnd);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
      v?.removeEventListener("webkitbeginfullscreen", onWebkitBegin);
      v?.removeEventListener("webkitendfullscreen", onWebkitEnd);
      unlockScreenOrientation();
    };
  }, [videoRef]);

  return { fullscreen, toggleFullscreen };
}
