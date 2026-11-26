import Hls, { type Level } from "hls.js";
import {
  ArrowLeft,
  Captions,
  FastForward,
  Gauge,
  Keyboard,
  Loader2,
  Maximize,
  Minimize,
  MonitorPlay,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Server,
  Settings,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { activeCueText, parseVtt, type SubtitleCue } from "@/lib/player/subtitles";
import type { ResolvedStream, StreamSource } from "@/lib/stream/resolver";
import { cn } from "@/lib/utils";

export interface VideoPlayerProps {
  stream: ResolvedStream;
  title: string;
  subtitle?: string | null | undefined;
  poster?: string | null | undefined;
  initialTime?: number | undefined;
  onTimeProgress?: ((currentTime: number, duration: number) => void) | undefined;
  onBack: () => void;
  onPrev?: (() => void) | null | undefined;
  onNext?: (() => void) | null | undefined;
  nextLabel?: string | null | undefined;
  onSwitchEmbed?: (() => void) | undefined;
  /** Number of seconds to jump forward when Skip Intro is clicked (e.g. 85 for anime/movies). */
  skipIntroSeconds?: number | undefined;
  /** Optional controls rendered on the right side of the top player bar. */
  topRight?: ReactNode | undefined;
  /** Shown over the video while paused (e.g. companion ad slot). */
  pausedOverlay?: ReactNode | undefined;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(t: number) {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60)
    .toString()
    .padStart(2, "0");
  return h ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const AUTO_NEXT_KEY = "shadow:auto-next";

function readAutoNextPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AUTO_NEXT_KEY) !== "false";
  } catch {
    return true;
  }
}

function fitAspectBox(
  containerW: number,
  containerH: number,
  aspect: number,
): { width: number; height: number } | null {
  if (containerW <= 0 || containerH <= 0 || !Number.isFinite(aspect) || aspect <= 0) return null;
  const containerAspect = containerW / containerH;
  if (containerAspect > aspect) {
    return { width: Math.round(containerH * aspect), height: Math.round(containerH) };
  }
  return { width: Math.round(containerW), height: Math.round(containerW / aspect) };
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type WebkitVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
};

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait" | "any") => Promise<void>;
  unlock?: () => void;
};

function getFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export default function VideoPlayer({
  stream,
  title,
  subtitle,
  poster,
  initialTime = 0,
  onTimeProgress,
  onBack,
  onPrev,
  onNext,
  nextLabel,
  onSwitchEmbed,
  skipIntroSeconds = 85,
  topRight,
  pausedOverlay,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedSeekUrlRef = useRef<string | null>(null);
  const resumeOverrideRef = useRef<number | null>(null);
  const initialTimeRef = useRef(initialTime);
  const onProgressRef = useRef(onTimeProgress);
  const lastReportRef = useRef(0);

  initialTimeRef.current = initialTime;
  onProgressRef.current = onTimeProgress;

  const activeSources = useMemo<StreamSource[]>(() => {
    if (stream.sources?.length) {
      return stream.sources;
    }
    return [{ url: stream.url, type: stream.type, label: "Server 1" }];
  }, [stream.sources, stream.url, stream.type]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [switchingMessage, setSwitchingMessage] = useState<string | null>(null);

  const currentSource = activeSources[sourceIndex] ?? activeSources[0]!;
  const activeUrl = currentSource.url;
  const activeType = currentSource.type;

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [current, setCurrent] = useState(initialTime > 0 ? initialTime : 0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [activeLevel, setActiveLevel] = useState(-1);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menu, setMenu] = useState<null | "settings" | "servers">(null);
  const [error, setError] = useState<string | null>(null);
  const [introDismissed, setIntroDismissed] = useState(false);
  const [autoNext, setAutoNext] = useState<boolean>(readAutoNextPref);
  const [upNextIn, setUpNextIn] = useState<number | null>(null);
  const [endedManual, setEndedManual] = useState(false);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [vttCues, setVttCues] = useState<SubtitleCue[]>([]);
  const [nativeCueText, setNativeCueText] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [osdMessage, setOsdMessage] = useState<string | null>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((msg: string) => {
    setOsdMessage(msg);
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsdMessage(null), 1100);
  }, []);

  const subtitles = useMemo(() => stream.subtitles ?? [], [stream.subtitles]);
  const [subTrack, setSubTrack] = useState<number>(() => (subtitles.length > 0 ? 0 : -1));

  useEffect(() => {
    setSourceIndex(0);
    setReloadNonce(0);
    setSwitchingMessage(null);
    resumeOverrideRef.current = null;
    setSubTrack(subtitles.length > 0 ? 0 : -1);
    setIntroDismissed(false);
    setUpNextIn(null);
    setEndedManual(false);
    appliedSeekUrlRef.current = null;
  }, [stream.url, stream.sources, subtitles.length]);

  const switchToSource = useCallback(
    (nextIdx: number, statusMessage?: string) => {
      if (nextIdx < 0 || nextIdx >= activeSources.length) return;
      const v = videoRef.current;
      if (v && v.currentTime > 1) {
        resumeOverrideRef.current = v.currentTime;
      }
      appliedSeekUrlRef.current = null;
      setError(null);
      setWaiting(true);
      setSwitchingMessage(statusMessage ?? `Switching to ${activeSources[nextIdx]!.label}…`);
      setSourceIndex(nextIdx);
      setMenu(null);
    },
    [activeSources],
  );

  const triggerFallback = useCallback(() => {
    if (sourceIndex + 1 < activeSources.length) {
      const nextIdx = sourceIndex + 1;
      switchToSource(nextIdx, `Switching to backup server (${activeSources[nextIdx]!.label})…`);
      return;
    }
    if (onSwitchEmbed) {
      setSwitchingMessage("Switching to alternate player…");
      onSwitchEmbed();
      return;
    }
    setSwitchingMessage(null);
    setWaiting(false);
    setError("This stream couldn't be played.");
  }, [sourceIndex, activeSources, switchToSource, onSwitchEmbed]);

  const triggerFallbackRef = useRef(triggerFallback);
  triggerFallbackRef.current = triggerFallback;

  // Measure the viewport container so the video frame box + bottom-of-video subtitles stay exact.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const applyInitialSeek = useCallback(
    (video: HTMLVideoElement) => {
      const target = resumeOverrideRef.current ?? initialTimeRef.current;
      if (target <= 0.5 || appliedSeekUrlRef.current === activeUrl) return;
      appliedSeekUrlRef.current = activeUrl;
      resumeOverrideRef.current = null;
      const maxTarget =
        Number.isFinite(video.duration) && video.duration > 2 ? video.duration - 1 : target;
      video.currentTime = Math.min(target, maxTarget);
      setCurrent(video.currentTime);
    },
    [activeUrl],
  );

  // Load parsed WebVTT cues for active subtitle track so captions always render inside the video frame.
  useEffect(() => {
    const active = subTrack >= 0 ? subtitles[subTrack] : null;
    if (!active?.url) {
      setVttCues([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(active.url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.text() : ""))
      .then((text) => {
        if (!ctrl.signal.aborted) setVttCues(text ? parseVtt(text) : []);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setVttCues([]);
      });
    return () => ctrl.abort();
  }, [subTrack, subtitles]);

  // Keep native <track> elements hidden (so browser never renders inside viewport black bars) while listening to cuechange fallback.
  useEffect(() => {
    const v = videoRef.current;
    if (!v?.textTracks) return;
    const listeners: (() => void)[] = [];
    const syncTracks = () => {
      for (let i = 0; i < v.textTracks.length; i++) {
        const track = v.textTracks[i];
        if (!track) continue;
        track.mode = "hidden";
        if (i === subTrack && track.addEventListener) {
          const onCue = () => {
            const list = track.activeCues;
            if (!list || !list.length) {
              setNativeCueText("");
              return;
            }
            const lines: string[] = [];
            for (let k = 0; k < list.length; k++) {
              const cue = list[k] as VTTCue | undefined;
              if (cue?.text) lines.push(cue.text.replace(/<[^>]+>/g, "").trim());
            }
            setNativeCueText(lines.join("\n"));
          };
          track.addEventListener("cuechange", onCue);
          listeners.push(() => track.removeEventListener?.("cuechange", onCue));
        }
      }
    };
    syncTracks();
    v.textTracks.addEventListener?.("addtrack", syncTracks);
    return () => {
      v.textTracks?.removeEventListener?.("addtrack", syncTracks);
      listeners.forEach((off) => off());
    };
  }, [subTrack, subtitles]);

  const toggleAutoNext = useCallback(() => {
    setAutoNext((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AUTO_NEXT_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Attach the source: hls.js where MSE exists, native HLS on Safari/iOS, plain src for MP4.
  // Automatically retries once then fails over to backup servers or alternate embed on fatal/timeout errors.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setWaiting(true);
    setLevels([]);
    setLevel(-1);

    let disposed = false;
    let hasStarted = false;
    let networkRetries = 0;
    let mediaRetries = 0;

    const startupTimeout = setTimeout(() => {
      if (!disposed && !hasStarted) {
        triggerFallbackRef.current();
      }
    }, 12_000);

    const markReady = () => {
      if (hasStarted) return;
      hasStarted = true;
      clearTimeout(startupTimeout);
      setSwitchingMessage(null);
    };

    video.addEventListener("loadedmetadata", markReady);
    video.addEventListener("canplay", markReady);
    video.addEventListener("playing", markReady);

    const startTarget = resumeOverrideRef.current ?? initialTimeRef.current;

    if (activeType === "hls" && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        backBufferLength: 60,
        startPosition: startTarget > 0.5 ? startTarget : -1,
      });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        markReady();
        setLevels(data.levels);
        applyInitialSeek(video);
        void video.play?.()?.catch?.(() => setPlaying(false));
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setActiveLevel(data.level));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal || disposed) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 1) {
          networkRetries += 1;
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 1) {
          mediaRetries += 1;
          hls.recoverMediaError();
        } else {
          triggerFallbackRef.current();
        }
      });
      hls.loadSource(activeUrl);
      hls.attachMedia(video);
      return () => {
        disposed = true;
        clearTimeout(startupTimeout);
        video.removeEventListener("loadedmetadata", markReady);
        video.removeEventListener("canplay", markReady);
        video.removeEventListener("playing", markReady);
        if (video.currentTime > 0) {
          onProgressRef.current?.(video.currentTime, video.duration || 0);
        }
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (activeType === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
      clearTimeout(startupTimeout);
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("canplay", markReady);
      video.removeEventListener("playing", markReady);
      triggerFallbackRef.current();
      return;
    }

    video.src = activeUrl;
    try {
      void video.play?.()?.catch?.(() => setPlaying(false));
    } catch {
      setPlaying(false);
    }
    return () => {
      disposed = true;
      clearTimeout(startupTimeout);
      video.removeEventListener("loadedmetadata", markReady);
      video.removeEventListener("canplay", markReady);
      video.removeEventListener("playing", markReady);
      if (video.currentTime > 0) {
        onProgressRef.current?.(video.currentTime, video.duration || 0);
      }
      video.removeAttribute("src");
      try {
        video.load?.();
      } catch {
        /* ignore */
      }
    };
  }, [activeUrl, activeType, reloadNonce, applyInitialSeek]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      announce("Play");
      void v.play?.()?.catch?.(() => {});
    } else {
      announce("Pause");
      v.pause();
    }
  }, [announce]);

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      const max = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : Infinity;
      const next = Math.max(0, Math.min(max, v.currentTime + delta));
      v.currentTime = next;
      setCurrent(next);
      announce(delta > 0 ? `+${delta}s` : `${delta}s`);
    },
    [announce],
  );

  const unlockOrientation = useCallback(() => {
    try {
      const orientation = (typeof screen !== "undefined" ? screen.orientation : undefined) as
        LockableOrientation | undefined;
      orientation?.unlock?.();
    } catch {
      /* ignore */
    }
  }, []);

  const lockLandscapeOrientation = useCallback(async () => {
    try {
      const orientation = (typeof screen !== "undefined" ? screen.orientation : undefined) as
        LockableOrientation | undefined;
      if (orientation?.lock) {
        await orientation.lock("landscape");
      }
    } catch {
      /* desktop or iOS Safari restricts orientation.lock — safely ignored */
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current as FullscreenElement | null;
    const video = videoRef.current as WebkitVideoElement | null;
    if (!el) return;

    const doc = document as FullscreenDocument;
    if (getFullscreenElement()) {
      announce("Exit full screen");
      unlockOrientation();
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      } catch {
        /* ignore */
      }
      return;
    }

    announce("Full screen");
    let entered = false;
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

    if (!entered && video?.webkitEnterFullscreen) {
      try {
        video.webkitEnterFullscreen();
        entered = true;
      } catch {
        /* ignore */
      }
    }

    if (entered) {
      await lockLandscapeOrientation();
    }
  }, [announce, lockLandscapeOrientation, unlockOrientation]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const nextMuted = !v.muted;
    v.muted = nextMuted;
    setMuted(nextMuted);
    announce(nextMuted ? "Muted" : `Volume ${Math.round((v.volume || 1) * 100)}%`);
  }, [announce]);

  const cycleSubtitles = useCallback(() => {
    if (subtitles.length === 0) {
      announce("No subtitles available");
      return;
    }
    setSubTrack((prev) => {
      const next = prev + 1 >= subtitles.length ? -1 : prev + 1;
      announce(next >= 0 ? `Subtitles: ${subtitles[next]!.label}` : "Subtitles: Off");
      return next;
    });
  }, [subtitles, announce]);

  const poke = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) {
        setControlsVisible(false);
        setMenu(null);
      }
    }, 3000);
  }, []);

  const skipIntro = useCallback(() => {
    const v = videoRef.current;
    if (!v || skipIntroSeconds <= 0) return;
    const maxTarget = Number.isFinite(v.duration) && v.duration > 5 ? v.duration - 2 : Infinity;
    const next = Math.min(maxTarget, v.currentTime + skipIntroSeconds);
    v.currentTime = next;
    setCurrent(next);
    setIntroDismissed(true);
    announce("Skipped Intro");
  }, [skipIntroSeconds, announce]);

  useEffect(() => {
    if (upNextIn === null) return;
    if (upNextIn <= 0) {
      setUpNextIn(null);
      onNext?.();
      return;
    }
    const timer = setTimeout(() => setUpNextIn((n) => (n !== null ? n - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [upNextIn, onNext]);

  useEffect(() => {
    const v = videoRef.current;
    const onFs = () => {
      const fs = Boolean(getFullscreenElement());
      setFullscreen(fs);
      if (!fs) unlockOrientation();
    };
    const onWebkitBegin = () => {
      setFullscreen(true);
      void lockLandscapeOrientation();
    };
    const onWebkitEnd = () => {
      setFullscreen(false);
      unlockOrientation();
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
      unlockOrientation();
    };
  }, [lockLandscapeOrientation, unlockOrientation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable ||
        (tag === "INPUT" && (target as HTMLInputElement).type !== "range")
      ) {
        return;
      }
      const isRangeInput = tag === "INPUT" && (target as HTMLInputElement).type === "range";
      const v = videoRef.current;
      if (!v) return;

      if (e.key === "Escape") {
        if (shortcutsOpen) {
          e.preventDefault();
          setShortcutsOpen(false);
          return;
        }
        if (menu) {
          e.preventDefault();
          setMenu(null);
          return;
        }
        return;
      }

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
        poke();
        return;
      }

      if (isRangeInput && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        return;
      }

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
        case "l":
          e.preventDefault();
          seekBy(10);
          break;
        case "ArrowLeft":
        case "j":
          e.preventDefault();
          seekBy(-10);
          break;
        case "ArrowUp": {
          e.preventDefault();
          const nextVol = Math.min(1, Math.round((v.volume + 0.1) * 10) / 10);
          v.volume = nextVol;
          if (nextVol > 0 && v.muted) v.muted = false;
          setVolume(nextVol);
          setMuted(v.muted);
          announce(`Volume ${Math.round(nextVol * 100)}%`);
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const nextVol = Math.max(0, Math.round((v.volume - 0.1) * 10) / 10);
          v.volume = nextVol;
          v.muted = nextVol === 0;
          setVolume(nextVol);
          setMuted(v.muted);
          announce(nextVol === 0 ? "Muted" : `Volume ${Math.round(nextVol * 100)}%`);
          break;
        }
        case "f":
          e.preventDefault();
          void toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "c":
          e.preventDefault();
          cycleSubtitles();
          break;
        case "s":
          e.preventDefault();
          skipIntro();
          break;
        case "n":
          if (e.shiftKey && onNext) {
            e.preventDefault();
            onNext();
          } else {
            return;
          }
          break;
        default:
          if (/^[0-9]$/.test(key) && Number.isFinite(v.duration) && v.duration > 0) {
            e.preventDefault();
            const pctJump = Number(key) * 10;
            const targetTime = (v.duration * pctJump) / 100;
            v.currentTime = targetTime;
            setCurrent(targetTime);
            announce(`Jump ${pctJump}%`);
            break;
          }
          return;
      }
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    togglePlay,
    seekBy,
    toggleFullscreen,
    toggleMute,
    cycleSubtitles,
    skipIntro,
    onNext,
    poke,
    announce,
    shortcutsOpen,
    menu,
  ]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (osdTimer.current) clearTimeout(osdTimer.current);
    },
    [],
  );

  const chooseLevel = (i: number) => {
    setLevel(i);
    if (hlsRef.current) hlsRef.current.currentLevel = i;
  };
  const chooseRate = (r: number) => {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  };
  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      // PiP unavailable
    }
  };

  const pct = duration ? (current / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;
  const showUi = controlsVisible || !playing;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const levelLabel = (l: Level) =>
    l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`;
  const currentQuality =
    level === -1
      ? `Auto${levels[activeLevel] ? ` (${levelLabel(levels[activeLevel]!)})` : ""}`
      : levels[level]
        ? levelLabel(levels[level]!)
        : "Auto";

  const videoBox = fitAspectBox(containerSize.width, containerSize.height, videoAspect);
  const controlsTouchBottom = !videoBox || containerSize.height - videoBox.height < 140;
  const captionText = subTrack >= 0 ? activeCueText(vttCues, current) || nativeCueText : "";
  const hasServerMenu = activeSources.length > 1 || Boolean(onSwitchEmbed);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex size-full select-none items-center justify-center overflow-hidden bg-scrim",
        !showUi && "cursor-none",
      )}
      onMouseMove={poke}
      onTouchStart={poke}
    >
      <div
        data-testid="video-frame"
        className="relative overflow-hidden"
        style={
          videoBox
            ? { width: videoBox.width, height: videoBox.height }
            : { width: "100%", height: "100%" }
        }
      >
        <video
          ref={videoRef}
          className="size-full object-contain"
          playsInline
          {...(poster ? { poster } : {})}
          onClick={togglePlay}
          onDoubleClick={() => void toggleFullscreen()}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth > 0 && v.videoHeight > 0) {
              setVideoAspect(v.videoWidth / v.videoHeight);
            }
            applyInitialSeek(v);
          }}
          onPlay={() => {
            setPlaying(true);
            poke();
          }}
          onPause={(e) => {
            setPlaying(false);
            setControlsVisible(true);
            onProgressRef.current?.(e.currentTarget.currentTime, e.currentTarget.duration || 0);
          }}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => {
            setWaiting(false);
            setSwitchingMessage(null);
          }}
          onCanPlay={(e) => {
            setWaiting(false);
            setSwitchingMessage(null);
            applyInitialSeek(e.currentTarget);
          }}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            const d = e.currentTarget.duration || 0;
            setCurrent(t);
            const now = Date.now();
            if (now - lastReportRef.current >= 1500) {
              lastReportRef.current = now;
              onProgressRef.current?.(t, d);
            }
          }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onProgress={(e) => {
            const b = e.currentTarget.buffered;
            if (b.length) setBuffered(b.end(b.length - 1));
          }}
          onVolumeChange={(e) => {
            setVolume(e.currentTarget.volume);
            setMuted(e.currentTarget.muted);
          }}
          onEnded={(e) => {
            onProgressRef.current?.(0, e.currentTarget.duration || 0);
            if (!onNext) return;
            if (autoNext) setUpNextIn(3);
            else setEndedManual(true);
          }}
          onError={() => triggerFallback()}
        >
          {subtitles.map((t, i) => (
            <track
              key={t.url}
              kind="subtitles"
              src={t.url}
              srcLang={t.lang}
              label={t.label}
              default={i === 0}
            />
          ))}
        </video>

        {captionText && !error && (
          <div
            data-testid="video-subtitles"
            className={cn(
              "pointer-events-none absolute inset-x-4 z-10 flex justify-center text-center transition-[bottom] duration-200",
              showUi && controlsTouchBottom ? "bottom-20 sm:bottom-24" : "bottom-3 sm:bottom-5",
            )}
          >
            <span className="max-w-3xl whitespace-pre-line rounded-md bg-scrim/80 px-3 py-1 text-sm font-medium leading-snug text-foreground shadow-lg sm:text-base md:text-lg">
              {captionText}
            </span>
          </div>
        )}
      </div>

      {(waiting || switchingMessage) && !error && (
        <div
          role="status"
          aria-live="polite"
          data-testid="player-buffering-status"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center"
        >
          <Loader2 className="size-12 animate-spin text-cerulean" />
          {switchingMessage && (
            <span className="rounded-full border border-foreground/15 bg-scrim/90 px-4 py-1.5 text-xs font-semibold text-foreground shadow-card backdrop-blur-md">
              {switchingMessage}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-scrim/85 p-6 text-center backdrop-blur-sm">
          <p className="font-display text-lg font-semibold">{error}</p>
          <p className="text-sm text-muted-foreground">
            Try switching servers, switching to the alternate player, or picking another episode.
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setWaiting(true);
                setReloadNonce((n) => n + 1);
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:brightness-110"
            >
              <RefreshCw className="size-3.5" /> Retry Stream
            </button>
            {activeSources.length > 1 && (
              <button
                type="button"
                onClick={() => switchToSource((sourceIndex + 1) % activeSources.length)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-foreground/20 bg-surface px-4 py-2 text-xs font-semibold text-foreground transition hover:border-cerulean/60"
              >
                <Server className="size-3.5" /> Try Next Server
              </button>
            )}
            {onSwitchEmbed && (
              <button
                type="button"
                onClick={onSwitchEmbed}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-foreground/20 bg-surface px-4 py-2 text-xs font-semibold text-foreground transition hover:border-cerulean/60"
              >
                <MonitorPlay className="size-3.5" /> Alternate Player
              </button>
            )}
          </div>
        </div>
      )}

      {!playing && !waiting && !error && upNextIn === null && !endedManual && pausedOverlay}

      {skipIntroSeconds > 0 &&
        !introDismissed &&
        !error &&
        !waiting &&
        upNextIn === null &&
        current < 240 &&
        (duration === 0 || duration > current + 25) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              skipIntro();
            }}
            className="absolute bottom-24 right-4 z-20 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-foreground/20 bg-scrim/85 px-4 py-2 font-display text-xs font-semibold text-foreground shadow-card backdrop-blur-md transition hover:border-cerulean hover:bg-brand-gradient hover:text-primary-foreground sm:bottom-28 sm:right-6"
          >
            <FastForward className="size-3.5" />
            <span>Skip Intro</span>
          </button>
        )}

      {osdMessage && (
        <div
          role="status"
          aria-live="polite"
          data-testid="player-shortcut-feedback"
          className="pointer-events-none absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-lg border border-foreground/15 bg-scrim/90 px-4 py-1.5 font-display text-xs font-semibold text-foreground shadow-card backdrop-blur-md"
        >
          {osdMessage}
        </div>
      )}

      {shortcutsOpen && (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 z-30 flex items-center justify-center bg-scrim/75 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-foreground/15 bg-popover/95 p-5 shadow-card backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between border-b border-foreground/10 pb-3">
              <div className="flex items-center gap-2">
                <Keyboard className="size-4 text-cerulean" />
                <h2 className="font-display text-sm font-semibold">Keyboard Shortcuts</h2>
              </div>
              <button
                type="button"
                aria-label="Close shortcuts"
                onClick={() => setShortcutsOpen(false)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Play / Pause</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">Space / K</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Mute / Unmute</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">M</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Seek -10s / +10s</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">J / L</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Seek Arrows</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">← / →</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Volume</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">↑ / ↓</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Full Screen</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">F</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Subtitles</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">C</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Skip Intro</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">S</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Jump 0%–90%</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">0 – 9</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Next Episode</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">Shift + N</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {onNext && (upNextIn !== null || endedManual) && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-24 right-4 z-20 w-72 rounded-2xl border border-foreground/15 bg-popover/95 p-4 shadow-card backdrop-blur-xl sm:bottom-28 sm:right-6"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-cerulean">
            {upNextIn !== null ? `Up next in ${upNextIn}s` : "Episode finished"}
          </p>
          <p className="mt-1 truncate font-display text-sm font-semibold">
            {nextLabel || "Next episode"}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setUpNextIn(null);
                setEndedManual(false);
                onNext();
              }}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110"
            >
              <SkipForward className="size-3.5" />
              <span>Play Next</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setUpNextIn(null);
                setEndedManual(false);
              }}
              className="min-h-[44px] rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:bg-foreground/10 hover:text-foreground"
            >
              Stay
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 bg-player-top px-3 py-2.5 transition-opacity duration-300 sm:gap-3 sm:p-6 [@media(max-height:500px)]:py-2",
          showUi ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          onClick={() => {
            if (videoRef.current) {
              onProgressRef.current?.(videoRef.current.currentTime, videoRef.current.duration || 0);
            }
            onBack();
          }}
          aria-label="Back"
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full p-2 transition hover:bg-foreground/15"
        >
          <ArrowLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold sm:text-lg">{title}</p>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
          )}
        </div>
        {topRight && (
          <div
            className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {topRight}
          </div>
        )}
      </div>

      {/* Center play */}
      {!playing && !waiting && !error && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-gradient shadow-glow transition hover:scale-105 sm:size-20"
        >
          <Play className="size-7 translate-x-0.5 fill-current sm:size-8" />
        </button>
      )}

      {/* Bottom controls */}
      <div
        data-testid="player-bottom-controls"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 space-y-1.5 bg-player-bottom px-2.5 pb-2.5 pt-10 transition-opacity duration-300 sm:space-y-2 sm:px-6 sm:pb-4 sm:pt-16 [@media(max-height:500px)]:pt-6 [@media(max-height:500px)]:pb-2",
          showUi ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="group/seek relative flex h-8 items-center sm:h-6">
          <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-foreground/15 sm:h-1">
            <div className="h-full rounded-full bg-foreground/25" style={{ width: `${bufPct}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            aria-label="Seek"
            onChange={(e) => {
              const v = videoRef.current;
              if (v) v.currentTime = Number(e.target.value);
            }}
            className="range-brand relative h-full w-full cursor-pointer"
            style={{ "--fill": `${pct}%` } as React.CSSProperties}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-1 sm:flex-nowrap sm:gap-2">
          <div className="flex items-center gap-0.5 sm:gap-1.5">
            {onPrev && (
              <CtrlButton label="Previous episode" shortcutHint="Previous episode" onClick={onPrev}>
                <SkipBack />
              </CtrlButton>
            )}
            <CtrlButton
              label={playing ? "Pause" : "Play"}
              shortcutHint={playing ? "Pause (Space / K)" : "Play (Space / K)"}
              keyShortcuts="Space k"
              onClick={togglePlay}
            >
              {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
            </CtrlButton>
            <CtrlButton
              label="Back 10 seconds"
              shortcutHint="Back 10 seconds (Left Arrow / J)"
              keyShortcuts="ArrowLeft j"
              onClick={() => seekBy(-10)}
            >
              <RotateCcw />
            </CtrlButton>
            <CtrlButton
              label="Forward 10 seconds"
              shortcutHint="Forward 10 seconds (Right Arrow / L)"
              keyShortcuts="ArrowRight l"
              onClick={() => seekBy(10)}
            >
              <RotateCw />
            </CtrlButton>
            {onNext && (
              <CtrlButton
                label="Next episode"
                shortcutHint="Next episode (Shift+N)"
                keyShortcuts="Shift+N"
                onClick={onNext}
              >
                <SkipForward />
              </CtrlButton>
            )}
            {skipIntroSeconds > 0 && !introDismissed && current < 240 && (
              <button
                type="button"
                aria-keyshortcuts="s"
                title="Skip Intro (S)"
                onClick={skipIntro}
                className="hidden min-h-[36px] items-center gap-1 rounded-full border border-foreground/15 bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground/90 transition hover:border-cerulean/60 hover:bg-cerulean/20 sm:inline-flex"
              >
                <FastForward className="size-3.5" />
                <span>Skip Intro</span>
              </button>
            )}
            <div className="group/vol flex items-center">
              <CtrlButton
                label={muted ? "Unmute" : "Mute"}
                shortcutHint={muted ? "Unmute (M)" : "Mute (M)"}
                keyShortcuts="m"
                onClick={toggleMute}
              >
                <VolumeIcon />
              </CtrlButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.volume = Number(e.target.value);
                  v.muted = v.volume === 0;
                }}
                className="range-brand hidden w-0 transition-all duration-300 group-hover/vol:w-24 sm:block"
                style={{ "--fill": `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
              />
            </div>
            <span className="ml-0.5 text-[11px] tabular-nums text-foreground/85 sm:ml-1 sm:text-sm">
              {formatTime(current)}{" "}
              <span className="text-muted-foreground">/ {formatTime(duration)}</span>
            </span>
          </div>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5">
            {onNext && (
              <button
                type="button"
                onClick={toggleAutoNext}
                aria-pressed={autoNext}
                title="Automatically play the next episode when this one finishes"
                className={cn(
                  "hidden min-h-[36px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition md:inline-flex",
                  autoNext
                    ? "border-cerulean/50 bg-cerulean/20 text-foreground"
                    : "border-foreground/15 bg-foreground/5 text-muted-foreground hover:text-foreground",
                )}
              >
                <span>Auto Next: {autoNext ? "On" : "Off"}</span>
              </button>
            )}

            {hasServerMenu && (
              <div className="relative">
                <CtrlButton
                  label="Switch server"
                  shortcutHint="Switch stream server"
                  onClick={() => setMenu((m) => (m === "servers" ? null : "servers"))}
                >
                  <Server className={cn(menu === "servers" && "text-cerulean")} />
                </CtrlButton>
                {menu === "servers" && (
                  <div
                    role="menu"
                    aria-label="Stream servers"
                    className="absolute bottom-12 right-0 max-h-72 w-56 overflow-y-auto rounded-xl border border-foreground/10 bg-popover/95 p-2 text-sm shadow-card backdrop-blur-xl"
                  >
                    <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Stream Servers
                    </p>
                    {activeSources.map((src, idx) => (
                      <MenuItem
                        key={`${src.url}-${idx}`}
                        active={idx === sourceIndex}
                        onClick={() => switchToSource(idx)}
                      >
                        <span className="truncate">{src.label}</span>
                      </MenuItem>
                    ))}
                    {onSwitchEmbed && (
                      <>
                        <div className="my-1.5 h-px bg-foreground/10" />
                        <MenuItem
                          active={false}
                          onClick={() => {
                            setMenu(null);
                            onSwitchEmbed();
                          }}
                        >
                          <span className="flex items-center gap-1.5">
                            <MonitorPlay className="size-3.5 text-cerulean" />
                            Alternate Player
                          </span>
                        </MenuItem>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="hidden sm:block">
              <CtrlButton
                label="Keyboard shortcuts"
                shortcutHint="Keyboard shortcuts (?)"
                keyShortcuts="?"
                onClick={() => setShortcutsOpen((o) => !o)}
              >
                <Keyboard />
              </CtrlButton>
            </div>
            <div className="relative">
              <CtrlButton
                label="Settings"
                onClick={() => setMenu((m) => (m === "settings" ? null : "settings"))}
              >
                <Settings className={cn("transition", menu === "settings" && "rotate-45")} />
              </CtrlButton>
              {menu === "settings" && (
                <div className="absolute bottom-12 right-0 max-h-72 w-60 overflow-y-auto rounded-xl border border-foreground/10 bg-popover/95 p-2 text-sm shadow-card backdrop-blur-xl">
                  {hasServerMenu && (
                    <>
                      <p className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        <Server className="size-3" /> Server · {currentSource.label}
                      </p>
                      {activeSources.map((src, idx) => (
                        <MenuItem
                          key={`settings-${src.url}-${idx}`}
                          active={idx === sourceIndex}
                          onClick={() => switchToSource(idx)}
                        >
                          <span className="truncate">{src.label}</span>
                        </MenuItem>
                      ))}
                      {onSwitchEmbed && (
                        <MenuItem
                          active={false}
                          onClick={() => {
                            setMenu(null);
                            onSwitchEmbed();
                          }}
                        >
                          <span>Alternate Player</span>
                        </MenuItem>
                      )}
                      <div className="my-1.5 h-px bg-foreground/10" />
                    </>
                  )}
                  {levels.length > 0 && (
                    <>
                      <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Quality · {currentQuality}
                      </p>
                      <MenuItem active={level === -1} onClick={() => chooseLevel(-1)}>
                        Auto
                      </MenuItem>
                      {levels
                        .map((l, i) => ({ l, i }))
                        .sort((a, b) => (b.l.height || b.l.bitrate) - (a.l.height || a.l.bitrate))
                        .map(({ l, i }) => (
                          <MenuItem key={i} active={level === i} onClick={() => chooseLevel(i)}>
                            {levelLabel(l)}
                          </MenuItem>
                        ))}
                      <div className="my-1.5 h-px bg-foreground/10" />
                    </>
                  )}
                  {subtitles.length > 0 && (
                    <>
                      <p className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        <Captions className="size-3" /> Subtitles (C)
                      </p>
                      <MenuItem active={subTrack === -1} onClick={() => setSubTrack(-1)}>
                        Off
                      </MenuItem>
                      {subtitles.map((t, i) => (
                        <MenuItem
                          key={t.url}
                          active={subTrack === i}
                          onClick={() => setSubTrack(i)}
                        >
                          <span className="truncate">{t.label}</span>
                        </MenuItem>
                      ))}
                      <div className="my-1.5 h-px bg-foreground/10" />
                    </>
                  )}
                  <p className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Gauge className="size-3" /> Speed
                  </p>
                  <div className="grid grid-cols-3 gap-1 px-1 pb-1">
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => chooseRate(s)}
                        className={cn(
                          "min-h-[36px] rounded-md py-1.5 text-xs transition",
                          rate === s ? "bg-brand-gradient font-semibold" : "hover:bg-foreground/10",
                        )}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                  {onNext && (
                    <>
                      <div className="my-1.5 h-px bg-foreground/10" />
                      <MenuItem active={autoNext} onClick={toggleAutoNext}>
                        <span>Auto-play next episode</span>
                      </MenuItem>
                    </>
                  )}
                  <div className="my-1.5 h-px bg-foreground/10" />
                  <MenuItem
                    active={shortcutsOpen}
                    onClick={() => {
                      setMenu(null);
                      setShortcutsOpen(true);
                    }}
                  >
                    <span>Keyboard shortcuts (?)</span>
                  </MenuItem>
                </div>
              )}
            </div>
            <div className="hidden sm:block">
              <CtrlButton label="Picture in picture" onClick={() => void togglePip()}>
                <PictureInPicture2 />
              </CtrlButton>
            </div>
            <CtrlButton
              label={fullscreen ? "Exit full screen" : "Full screen"}
              shortcutHint={fullscreen ? "Exit full screen (F)" : "Full screen (F)"}
              keyShortcuts="f"
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize /> : <Maximize />}
            </CtrlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function CtrlButton({
  label,
  shortcutHint,
  keyShortcuts,
  onClick,
  children,
}: {
  label: string;
  shortcutHint?: string;
  keyShortcuts?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={keyShortcuts}
      title={shortcutHint ?? label}
      onClick={(e) => {
        if (e.detail > 0) e.currentTarget.blur();
        onClick();
      }}
      className="flex size-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition hover:bg-foreground/15 [&_svg]:size-5"
    >
      {children}
    </button>
  );
}

function MenuItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[40px] w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition hover:bg-foreground/10",
        active && "text-cerulean",
      )}
    >
      {children}
      {active && <span className="size-1.5 rounded-full bg-cerulean" />}
    </button>
  );
}
