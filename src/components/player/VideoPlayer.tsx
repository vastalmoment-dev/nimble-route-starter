import Hls, { type Level } from "hls.js";
import {
  ArrowLeft,
  Gauge,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ResolvedStream } from "@/lib/stream/resolver";
import { cn } from "@/lib/utils";

export interface VideoPlayerProps {
  stream: ResolvedStream;
  title: string;
  subtitle?: string | null;
  poster?: string | null;
  onBack: () => void;
  onNext?: (() => void) | null;
  /** Shown over the video while paused (e.g. companion ad slot). */
  pausedOverlay?: ReactNode;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(t: number) {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  return h ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export default function VideoPlayer({ stream, title, subtitle, poster, onBack, onNext, pausedOverlay }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [current, setCurrent] = useState(0);
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
  const [menu, setMenu] = useState<null | "settings">(null);
  const [error, setError] = useState<string | null>(null);

  // Attach the source: hls.js where MSE exists, native HLS on Safari/iOS, plain src for MP4.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setWaiting(true);
    setLevels([]);
    setLevel(-1);

    if (stream.type === "hls" && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, backBufferLength: 60 });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLevels(data.levels);
        void video.play().catch(() => setPlaying(false));
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setActiveLevel(data.level));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setError("This stream couldn't be played.");
      });
      hls.loadSource(stream.url);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (stream.type === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
      setError("Your browser can't play this stream.");
      return;
    }
    video.src = stream.url;
    void video.play().catch(() => setPlaying(false));
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }, [stream.url, stream.type]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (v) v.muted = !v.muted;
  }, []);

  const poke = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) {
        setControlsVisible(false);
        setMenu(null);
      }
    }, 2800);
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" && (e.target as HTMLInputElement).type !== "range") return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
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
        case "ArrowUp":
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          toggleMute();
          break;
        default:
          return;
      }
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, toggleFullscreen, toggleMute, poke]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

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
  const levelLabel = (l: Level) => (l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps`);
  const currentQuality = level === -1 ? `Auto${levels[activeLevel] ? ` (${levelLabel(levels[activeLevel]!)})` : ""}` : levels[level] ? levelLabel(levels[level]!) : "Auto";

  return (
    <div
      ref={containerRef}
      className={cn("relative size-full select-none overflow-hidden bg-scrim", !showUi && "cursor-none")}
      onMouseMove={poke}
      onTouchStart={poke}
    >
      <video
        ref={videoRef}
        className="size-full object-contain"
        playsInline
        {...(poster ? { poster } : {})}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true);
          poke();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onEnded={() => onNext?.()}
        onError={() => setError("This stream couldn't be played.")}
      />

      {waiting && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-12 animate-spin text-cerulean" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-scrim/80 text-center">
          <p className="font-display text-lg font-semibold">{error}</p>
          <p className="text-sm text-muted-foreground">Try another episode or come back later.</p>
        </div>
      )}

      {!playing && !waiting && !error && pausedOverlay}

      {/* Top bar */}
      <div className={cn("absolute inset-x-0 top-0 flex items-center gap-4 bg-player-top p-4 transition-opacity duration-300 sm:p-6", showUi ? "opacity-100" : "pointer-events-none opacity-0")}>
        <button type="button" onClick={onBack} aria-label="Back" className="rounded-full p-2 transition hover:bg-foreground/15">
          <ArrowLeft className="size-6" />
        </button>
        <div className="min-w-0">
          <p className="truncate font-display text-base font-semibold sm:text-lg">{title}</p>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>

      {/* Center play */}
      {!playing && !waiting && !error && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-gradient shadow-glow transition hover:scale-105"
        >
          <Play className="size-8 translate-x-0.5 fill-current" />
        </button>
      )}

      {/* Bottom controls */}
      <div className={cn("absolute inset-x-0 bottom-0 space-y-2 bg-player-bottom px-4 pb-4 pt-16 transition-opacity duration-300 sm:px-6", showUi ? "opacity-100" : "pointer-events-none opacity-0")}>
        <div className="group/seek relative flex h-4 items-center">
          <div className="pointer-events-none absolute inset-x-0 h-1 rounded-full bg-foreground/10">
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
            className="range-brand relative w-full"
            style={{ "--fill": `${pct}%` } as React.CSSProperties}
          />
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <CtrlButton label={playing ? "Pause" : "Play"} onClick={togglePlay}>
            {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </CtrlButton>
          <CtrlButton label="Back 10 seconds" onClick={() => seekBy(-10)}>
            <RotateCcw />
          </CtrlButton>
          <CtrlButton label="Forward 10 seconds" onClick={() => seekBy(10)}>
            <RotateCw />
          </CtrlButton>
          {onNext && (
            <CtrlButton label="Next episode" onClick={onNext}>
              <SkipForward />
            </CtrlButton>
          )}
          <div className="group/vol flex items-center">
            <CtrlButton label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
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
          <span className="ml-1 text-xs tabular-nums text-foreground/80 sm:text-sm">
            {formatTime(current)} <span className="text-muted-foreground">/ {formatTime(duration)}</span>
          </span>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <div className="relative">
              <CtrlButton label="Settings" onClick={() => setMenu((m) => (m ? null : "settings"))}>
                <Settings className={cn("transition", menu && "rotate-45")} />
              </CtrlButton>
              {menu && (
                <div className="absolute bottom-12 right-0 w-56 overflow-hidden rounded-xl border border-foreground/10 bg-popover/95 p-2 text-sm shadow-card backdrop-blur-xl">
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
                  <p className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Gauge className="size-3" /> Speed
                  </p>
                  <div className="grid grid-cols-3 gap-1 px-1 pb-1">
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => chooseRate(s)}
                        className={cn("rounded-md py-1.5 text-xs transition", rate === s ? "bg-brand-gradient font-semibold" : "hover:bg-foreground/10")}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <CtrlButton label="Picture in picture" onClick={() => void togglePip()}>
              <PictureInPicture2 />
            </CtrlButton>
            <CtrlButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize /> : <Maximize />}
            </CtrlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function CtrlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-full transition hover:bg-foreground/15 [&_svg]:size-5"
    >
      {children}
    </button>
  );
}

function MenuItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition hover:bg-foreground/10", active && "text-cerulean")}
    >
      {children}
      {active && <span className="size-1.5 rounded-full bg-cerulean" />}
    </button>
  );
}
