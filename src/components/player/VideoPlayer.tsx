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
import { useT, type SiteLanguage } from "@/lib/i18n";
import {
  exitLandscapeFullscreen,
  getFullscreenElement,
  useLandscapeFullscreen,
} from "@/lib/player/fullscreen";
import { activeCueText, parseVtt, type SubtitleCue } from "@/lib/player/subtitles";
import type { ResolvedStream, StreamSource, SubtitleTrack } from "@/lib/stream/resolver";
import { userSettings } from "@/lib/settings/store";
import { cn } from "@/lib/utils";

export const PRIMARY_SERVER_TIMEOUT_MS = 16_000;

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
  selectedSourceIndex?: number | undefined;
  onSelectSourceIndex?: ((index: number) => void) | undefined;
  /** Number of seconds to jump forward when Skip Intro is clicked (e.g. 85 for anime/movies). */
  skipIntroSeconds?: number | undefined;
  /** Optional controls rendered on the right side of the top player bar. */
  topRight?: ReactNode | undefined;
  /** Shown over the video while paused (e.g. companion ad slot). */
  pausedOverlay?: ReactNode | undefined;
  /** Whether to auto-enable preferred subtitles initially (defaults true). */
  preferSubtitles?: boolean | undefined;
  /** Preferred spoken audio track language inside multi-audio HLS/video streams. */
  preferredAudioLang?: "en" | "fr" | "ja" | undefined;
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

function readAutoNextPref(): boolean {
  return userSettings.get().autoPlayNext;
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

export interface AudioTrackOption {
  id: number;
  name: string;
  lang: string;
}

type NativeAudioTrackList = {
  length: number;
  [index: number]: { id?: string; label?: string; language?: string; enabled: boolean };
};

export function pickPreferredAudioTrack(
  tracks: AudioTrackOption[],
  preferred?: "en" | "fr" | "ja",
): number {
  if (tracks.length <= 1 || !preferred) return tracks[0]?.id ?? -1;
  const matchers: Record<"en" | "fr" | "ja", RegExp> = {
    en: /\b(en|eng|english|anglais|dub|us)\b/i,
    fr: /\b(fr|fre|fra|french|fran[cç]ais|vf|vff|vfq)\b/i,
    ja: /\b(ja|jp|jpn|japanese|japonais|orig|original)\b/i,
  };
  const re = matchers[preferred];
  const exact = tracks.find((tr) => re.test(tr.lang.trim()) || re.test(tr.name.trim()));
  if (exact) return exact.id;
  if (preferred === "en") {
    // If looking for English on a Japanese/French dual-audio track with an untagged alt track, prefer non-FR/non-JA track.
    const nonForeign = tracks.find(
      (tr) =>
        !matchers.fr.test(`${tr.lang} ${tr.name}`) && !matchers.ja.test(`${tr.lang} ${tr.name}`),
    );
    if (nonForeign) return nonForeign.id;
  }
  return tracks[0]?.id ?? -1;
}

function pickPreferredSubTrack(
  subtitles: SubtitleTrack[],
  lang: SiteLanguage,
  preferSubtitles = true,
): number {
  if (!preferSubtitles || subtitles.length === 0) return -1;
  if (lang === "fr") {
    const frIdx = subtitles.findIndex(
      (s) =>
        /^(fr|fre|fra)\b/i.test((s.lang ?? "").trim()) ||
        /\b(french|fran[cç]ais)\b/i.test(s.label ?? ""),
    );
    if (frIdx >= 0) return frIdx;
  } else {
    const enIdx = subtitles.findIndex(
      (s) =>
        /^(en|eng)\b/i.test((s.lang ?? "").trim()) || /\b(english|anglais)\b/i.test(s.label ?? ""),
    );
    if (enIdx >= 0) return enIdx;
  }
  return 0;
}

export async function raceSecondarySources(
  candidates: StreamSource[],
  timeoutMs = 2500,
  externalSignal?: AbortSignal,
): Promise<number | null> {
  if (candidates.length === 0 || typeof fetch === "undefined") return null;
  if (externalSignal?.aborted) return null;

  const ctrl = new AbortController();
  const onExternalAbort = () => ctrl.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

  return new Promise<number | null>((resolve) => {
    let done = false;
    let settled = 0;
    const finish = (winner: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
      ctrl.abort();
      resolve(winner);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    candidates.forEach((candidate, idx) => {
      void (async () => {
        try {
          if (candidate.type === "hls" || /\.m3u8(\?|$)/i.test(candidate.url)) {
            const res = await fetch(candidate.url, { method: "GET", signal: ctrl.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = (await res.text()).trim();
            if (!text || text.startsWith("<") || !text.includes("#EXTM3U")) {
              throw new Error("Invalid HLS manifest");
            }
          } else {
            let res = await fetch(candidate.url, { method: "HEAD", signal: ctrl.signal });
            if (res.status === 405 || res.status === 501) {
              res = await fetch(candidate.url, {
                method: "GET",
                headers: { Range: "bytes=0-1" },
                signal: ctrl.signal,
              });
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          }
          finish(idx);
        } catch {
          settled += 1;
          if (settled >= candidates.length) {
            finish(null);
          }
        }
      })();
    });
  });
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
  selectedSourceIndex,
  onSelectSourceIndex,
  skipIntroSeconds = 85,
  topRight,
  pausedOverlay,
  preferSubtitles = true,
  preferredAudioLang,
}: VideoPlayerProps) {
  const { lang, t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedSeekUrlRef = useRef<string | null>(null);
  const resumeOverrideRef = useRef<number | null>(null);
  const initialTimeRef = useRef(initialTime);
  const onProgressRef = useRef(onTimeProgress);
  const onSelectSourceRef = useRef(onSelectSourceIndex);
  const lastReportRef = useRef(0);

  initialTimeRef.current = initialTime;
  onProgressRef.current = onTimeProgress;
  onSelectSourceRef.current = onSelectSourceIndex;

  const activeSources = useMemo<StreamSource[]>(() => {
    if (stream.sources?.length) {
      return stream.sources;
    }
    return [{ url: stream.url, type: stream.type, label: "Server 1" }];
  }, [stream.sources, stream.url, stream.type]);

  const [sourceIndex, setSourceIndex] = useState(() =>
    typeof selectedSourceIndex === "number" &&
    selectedSourceIndex >= 0 &&
    selectedSourceIndex < activeSources.length
      ? selectedSourceIndex
      : 0,
  );
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
  const [audioTracks, setAudioTracks] = useState<AudioTrackOption[]>([]);
  const [audioTrackIndex, setAudioTrackIndex] = useState(-1);
  const [rate, setRate] = useState(1);
  const { fullscreen, toggleFullscreen: runLandscapeFullscreen } = useLandscapeFullscreen(
    containerRef,
    videoRef,
  );
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
  const [subTrack, setSubTrack] = useState<number>(() =>
    pickPreferredSubTrack(subtitles, lang, preferSubtitles),
  );

  useEffect(() => {
    setReloadNonce(0);
    setSwitchingMessage(null);
    resumeOverrideRef.current = null;
    setIntroDismissed(false);
    setUpNextIn(null);
    setEndedManual(false);
    appliedSeekUrlRef.current = null;
  }, [stream.url, stream.sources]);

  useEffect(() => {
    const nextIdx =
      typeof selectedSourceIndex === "number" &&
      selectedSourceIndex >= 0 &&
      selectedSourceIndex < activeSources.length
        ? selectedSourceIndex
        : 0;
    setSourceIndex(nextIdx);
    appliedSeekUrlRef.current = null;
  }, [stream.url, stream.sources, selectedSourceIndex, activeSources.length]);

  useEffect(() => {
    setSubTrack(pickPreferredSubTrack(subtitles, lang, preferSubtitles));
  }, [stream.url, stream.sources, subtitles, lang, preferSubtitles]);

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
      setSwitchingMessage(
        statusMessage ?? `${t("player.switchingTo")} ${activeSources[nextIdx]!.label}…`,
      );
      setSourceIndex(nextIdx);
      onSelectSourceRef.current?.(nextIdx);
      setMenu(null);
    },
    [activeSources, t],
  );

  const raceSeqRef = useRef(0);
  const preRacedOffsetRef = useRef<number | null>(null);
  const fallbackAttemptKeyRef = useRef<string | null>(null);

  const triggerFallback = useCallback(() => {
    const attemptKey = `${sourceIndex}:${activeUrl}:${reloadNonce}`;
    if (fallbackAttemptKeyRef.current === attemptKey) return;
    fallbackAttemptKeyRef.current = attemptKey;

    const remaining = activeSources.slice(sourceIndex + 1);
    if (remaining.length === 0) {
      if (onSwitchEmbed) {
        setSwitchingMessage(t("player.switchingAlternate"));
        onSwitchEmbed();
        return;
      }
      setSwitchingMessage(null);
      setWaiting(false);
      setError(t("player.errorTitle"));
      return;
    }

    const preRaced = preRacedOffsetRef.current;
    if (preRaced !== null && preRaced >= 0 && preRaced < remaining.length) {
      const nextIdx = sourceIndex + 1 + preRaced;
      preRacedOffsetRef.current = null;
      switchToSource(nextIdx, `${t("player.switchingBackup")} (${activeSources[nextIdx]!.label})…`);
      return;
    }

    if (remaining.length === 1) {
      const nextIdx = sourceIndex + 1;
      switchToSource(nextIdx, `${t("player.switchingBackup")} (${activeSources[nextIdx]!.label})…`);
      return;
    }

    const seq = ++raceSeqRef.current;
    setError(null);
    setWaiting(true);
    setSwitchingMessage(t("player.racingBackups"));
    void raceSecondarySources(remaining, 2500).then((winnerOffset) => {
      if (raceSeqRef.current !== seq) return;
      const chosenOffset = winnerOffset !== null ? winnerOffset : 0;
      const nextIdx = sourceIndex + 1 + chosenOffset;
      switchToSource(nextIdx, `${t("player.switchingBackup")} (${activeSources[nextIdx]!.label})…`);
    });
  }, [sourceIndex, activeUrl, reloadNonce, activeSources, switchToSource, onSwitchEmbed, t]);

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
      userSettings.update({ autoPlayNext: next });
      return next;
    });
  }, []);

  // Attach the source: hls.js where MSE exists, native HLS on Safari/iOS, plain src for MP4.
  // Gives the primary/current server 16 seconds to initialize AND become playable before racing backup providers.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setWaiting(true);
    setLevels([]);
    setLevel(-1);
    setAudioTracks([]);
    setAudioTrackIndex(-1);
    preRacedOffsetRef.current = null;
    fallbackAttemptKeyRef.current = null;
    const myRaceSeq = ++raceSeqRef.current;

    let disposed = false;
    let hasStarted = false;
    let networkRetries = 0;
    let mediaRetries = 0;
    const preRaceCtrl = new AbortController();

    const remainingSources = activeSources.slice(sourceIndex + 1);
    const preRaceTimer =
      remainingSources.length > 1
        ? setTimeout(
            () => {
              if (disposed || hasStarted) return;
              void raceSecondarySources(remainingSources, 3200, preRaceCtrl.signal).then(
                (winnerOffset) => {
                  if (!disposed && !hasStarted && raceSeqRef.current === myRaceSeq) {
                    preRacedOffsetRef.current = winnerOffset;
                  }
                },
              );
            },
            Math.max(1000, PRIMARY_SERVER_TIMEOUT_MS - 3500),
          )
        : null;

    const startupTimeout = setTimeout(() => {
      if (!disposed && !hasStarted) {
        triggerFallbackRef.current();
      }
    }, PRIMARY_SERVER_TIMEOUT_MS);

    const markPlayable = () => {
      if (hasStarted) return;
      hasStarted = true;
      clearTimeout(startupTimeout);
      if (preRaceTimer) clearTimeout(preRaceTimer);
      preRaceCtrl.abort();
      setSwitchingMessage(null);
    };

    const onLoadedMetadata = () => {
      if (video.readyState >= 3) {
        markPlayable();
      }
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("canplay", markPlayable);
    video.addEventListener("playing", markPlayable);

    const startTarget = resumeOverrideRef.current ?? initialTimeRef.current;

    const syncHlsAudioTracks = (hls: Hls) => {
      const tracks: AudioTrackOption[] = (hls.audioTracks ?? []).map((tr, idx) => ({
        id: idx,
        name: tr.name || tr.lang || `${t("player.audioTrack")} ${idx + 1}`,
        lang: tr.lang || "",
      }));
      setAudioTracks(tracks);
      if (tracks.length > 1) {
        const chosen = pickPreferredAudioTrack(tracks, preferredAudioLang);
        if (chosen >= 0 && hls.audioTrack !== chosen) {
          hls.audioTrack = chosen;
        }
        setAudioTrackIndex(chosen >= 0 ? chosen : hls.audioTrack);
      } else if (tracks.length === 1) {
        setAudioTrackIndex(0);
      }
    };

    if (activeType === "hls" && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        backBufferLength: 60,
        startPosition: startTarget > 0.5 ? startTarget : -1,
      });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLevels(data.levels);
        syncHlsAudioTracks(hls);
        applyInitialSeek(video);
        const playPromise = video.play?.();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            setPlaying(false);
            setWaiting(false);
          });
        } else {
          setWaiting(false);
        }
        if (video.readyState >= 3) {
          markPlayable();
        }
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        syncHlsAudioTracks(hls);
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_e, data) => {
        setAudioTrackIndex(data.id);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setActiveLevel(data.level));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal || disposed) return;
        const statusCode = (data.response as { code?: number } | undefined)?.code ?? 0;
        const hardBlocked =
          statusCode === 403 || statusCode === 404 || statusCode === 502 || statusCode === 503;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 1 && !hardBlocked) {
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
        if (preRaceTimer) clearTimeout(preRaceTimer);
        preRaceCtrl.abort();
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("canplay", markPlayable);
        video.removeEventListener("playing", markPlayable);
        if (video.currentTime > 0) {
          onProgressRef.current?.(video.currentTime, video.duration || 0);
        }
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (activeType === "hls" && !video.canPlayType("application/vnd.apple.mpegurl")) {
      clearTimeout(startupTimeout);
      if (preRaceTimer) clearTimeout(preRaceTimer);
      preRaceCtrl.abort();
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("canplay", markPlayable);
      video.removeEventListener("playing", markPlayable);
      triggerFallbackRef.current();
      return;
    }

    video.src = activeUrl;
    try {
      void video.play?.()?.catch?.(() => {
        setPlaying(false);
        if (video.readyState >= 1) setWaiting(false);
      });
    } catch {
      setPlaying(false);
    }
    return () => {
      disposed = true;
      clearTimeout(startupTimeout);
      if (preRaceTimer) clearTimeout(preRaceTimer);
      preRaceCtrl.abort();
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("canplay", markPlayable);
      video.removeEventListener("playing", markPlayable);
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
  }, [activeUrl, activeType, reloadNonce, applyInitialSeek, activeSources, sourceIndex]);

  // Stall watchdog: if buffering stays stuck for > 16s mid-playback without user pausing, fail over cleanly.
  useEffect(() => {
    if (!waiting || error) return;
    const stallTimer = setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused && v.readyState < 3) {
        triggerFallbackRef.current();
      }
    }, PRIMARY_SERVER_TIMEOUT_MS);
    return () => clearTimeout(stallTimer);
  }, [waiting, error, activeUrl, reloadNonce]);

  useEffect(() => {
    if (audioTracks.length <= 1) return;
    const chosen = pickPreferredAudioTrack(audioTracks, preferredAudioLang);
    if (chosen < 0) return;
    if (hlsRef.current && hlsRef.current.audioTrack !== chosen) {
      hlsRef.current.audioTrack = chosen;
    }
    const nativeList = (
      videoRef.current as (HTMLVideoElement & { audioTracks?: NativeAudioTrackList }) | null
    )?.audioTracks;
    if (nativeList && nativeList.length > 1) {
      for (let i = 0; i < nativeList.length; i++) {
        if (nativeList[i]) nativeList[i]!.enabled = i === chosen;
      }
    }
    setAudioTrackIndex(chosen);
  }, [preferredAudioLang, audioTracks]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      announce(t("player.play"));
      void v.play?.()?.catch?.(() => {});
    } else {
      announce(t("player.pause"));
      v.pause();
    }
  }, [announce, t]);

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

  const toggleFullscreen = useCallback(async () => {
    if (getFullscreenElement()) {
      announce(t("player.exitFullScreen"));
      await exitLandscapeFullscreen();
      return;
    }
    announce(t("player.fullScreen"));
    await runLandscapeFullscreen();
  }, [announce, runLandscapeFullscreen, t]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const nextMuted = !v.muted;
    v.muted = nextMuted;
    setMuted(nextMuted);
    announce(
      nextMuted ? t("player.muted") : `${t("player.volume")} ${Math.round((v.volume || 1) * 100)}%`,
    );
  }, [announce, t]);

  const cycleSubtitles = useCallback(() => {
    if (subtitles.length === 0) {
      announce(t("player.noSubtitles"));
      return;
    }
    setSubTrack((prev) => {
      const next = prev + 1 >= subtitles.length ? -1 : prev + 1;
      announce(
        next >= 0
          ? `${t("player.subtitles")}: ${subtitles[next]!.label}`
          : t("player.subtitlesOff"),
      );
      return next;
    });
  }, [subtitles, announce, t]);

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
    announce(t("player.skippedIntro"));
  }, [skipIntroSeconds, announce, t]);

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

  // Fullscreen & screen orientation lifecycle is managed by useLandscapeFullscreen.

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
          announce(`${t("player.volume")} ${Math.round(nextVol * 100)}%`);
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const nextVol = Math.max(0, Math.round((v.volume - 0.1) * 10) / 10);
          v.volume = nextVol;
          v.muted = nextVol === 0;
          setVolume(nextVol);
          setMuted(v.muted);
          announce(
            nextVol === 0
              ? t("player.muted")
              : `${t("player.volume")} ${Math.round(nextVol * 100)}%`,
          );
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
            announce(`${t("player.jump")} ${pctJump}%`);
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
    t,
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
  const chooseAudioTrack = (idx: number) => {
    setAudioTrackIndex(idx);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = idx;
    }
    const nativeList = (
      videoRef.current as (HTMLVideoElement & { audioTracks?: NativeAudioTrackList }) | null
    )?.audioTracks;
    if (nativeList && nativeList.length > 1) {
      for (let i = 0; i < nativeList.length; i++) {
        if (nativeList[i]) nativeList[i]!.enabled = i === idx;
      }
    }
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
      ? `${t("player.auto")}${levels[activeLevel] ? ` (${levelLabel(levels[activeLevel]!)})` : ""}`
      : levels[level]
        ? levelLabel(levels[level]!)
        : t("player.auto");

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
            const nativeList = (v as HTMLVideoElement & { audioTracks?: NativeAudioTrackList })
              .audioTracks;
            if (nativeList && nativeList.length > 1 && !hlsRef.current) {
              const opts: AudioTrackOption[] = [];
              for (let i = 0; i < nativeList.length; i++) {
                const tr = nativeList[i]!;
                opts.push({
                  id: i,
                  name: tr.label || tr.language || `${t("player.audioTrack")} ${i + 1}`,
                  lang: tr.language || "",
                });
              }
              setAudioTracks(opts);
              const chosen = pickPreferredAudioTrack(opts, preferredAudioLang);
              if (chosen >= 0) {
                for (let i = 0; i < nativeList.length; i++) {
                  if (nativeList[i]) nativeList[i]!.enabled = i === chosen;
                }
                setAudioTrackIndex(chosen);
              }
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
          {subtitles.map((track, i) => (
            <track
              key={track.url}
              kind="subtitles"
              src={track.url}
              srcLang={track.lang}
              label={track.label}
              default={i === Math.max(0, subTrack)}
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
          <p className="text-sm text-muted-foreground">{t("player.errorHint")}</p>
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
              <RefreshCw className="size-3.5" /> {t("player.retryStream")}
            </button>
            {activeSources.length > 1 && (
              <button
                type="button"
                onClick={() => switchToSource((sourceIndex + 1) % activeSources.length)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-foreground/20 bg-surface px-4 py-2 text-xs font-semibold text-foreground transition hover:border-cerulean/60"
              >
                <Server className="size-3.5" /> {t("player.tryNextServer")}
              </button>
            )}
            {onSwitchEmbed && (
              <button
                type="button"
                onClick={onSwitchEmbed}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-foreground/20 bg-surface px-4 py-2 text-xs font-semibold text-foreground transition hover:border-cerulean/60"
              >
                <MonitorPlay className="size-3.5" /> {t("watch.server3Embed")}
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
            <span>{t("player.skipIntro")}</span>
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
          aria-label={t("player.shortcuts")}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 z-30 flex items-center justify-center bg-scrim/75 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-foreground/15 bg-popover/95 p-5 shadow-card backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between border-b border-foreground/10 pb-3">
              <div className="flex items-center gap-2">
                <Keyboard className="size-4 text-cerulean" />
                <h2 className="font-display text-sm font-semibold">{t("player.shortcutsTitle")}</h2>
              </div>
              <button
                type="button"
                aria-label={t("player.closeShortcuts")}
                onClick={() => setShortcutsOpen(false)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-1 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("player.shortcutPlayPause")}</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">Space / K</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("player.shortcutMute")}</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">M</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("player.shortcutSeek")}</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">J / L</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("player.shortcutArrows")}</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">← / →</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("player.shortcutVolume")}</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">↑ / ↓</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("player.shortcutFullscreen")}</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">F</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("player.shortcutSubtitles")}</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">C</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("player.shortcutSkipIntro")}</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">S</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("player.shortcutJump")}</dt>
                <dd className="font-mono text-[11px] font-semibold text-foreground">0 – 9</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("player.shortcutNext")}</dt>
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
            {upNextIn !== null
              ? `${t("player.upNextIn")} ${upNextIn}s`
              : t("player.episodeFinished")}
          </p>
          <p className="mt-1 truncate font-display text-sm font-semibold">
            {nextLabel || t("player.nextEpisode")}
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
              <span>{t("player.playNext")}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setUpNextIn(null);
                setEndedManual(false);
              }}
              className="min-h-[44px] rounded-full border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:bg-foreground/10 hover:text-foreground"
            >
              {t("player.stay")}
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
          aria-label={t("common.back")}
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
            className="flex w-full min-w-0 flex-wrap items-center justify-start gap-1.5 sm:w-auto sm:shrink-0 sm:justify-end sm:gap-2"
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
          aria-label={t("player.play")}
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
            aria-label={t("player.seek")}
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
              <CtrlButton
                label={t("player.prevEpisode")}
                shortcutHint={t("player.prevEpisode")}
                onClick={onPrev}
              >
                <SkipBack />
              </CtrlButton>
            )}
            <CtrlButton
              label={playing ? t("player.pause") : t("player.play")}
              shortcutHint={`${playing ? t("player.pause") : t("player.play")} (Space / K)`}
              keyShortcuts="Space k"
              onClick={togglePlay}
            >
              {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
            </CtrlButton>
            <CtrlButton
              label={t("player.back10")}
              shortcutHint={`${t("player.back10")} (← / J)`}
              keyShortcuts="ArrowLeft j"
              onClick={() => seekBy(-10)}
            >
              <RotateCcw />
            </CtrlButton>
            <CtrlButton
              label={t("player.forward10")}
              shortcutHint={`${t("player.forward10")} (→ / L)`}
              keyShortcuts="ArrowRight l"
              onClick={() => seekBy(10)}
            >
              <RotateCw />
            </CtrlButton>
            {onNext && (
              <CtrlButton
                label={t("player.nextEpisode")}
                shortcutHint={`${t("player.nextEpisode")} (Shift+N)`}
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
                title={`${t("player.skipIntro")} (S)`}
                onClick={skipIntro}
                className="hidden min-h-[36px] items-center gap-1 rounded-full border border-foreground/15 bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground/90 transition hover:border-cerulean/60 hover:bg-cerulean/20 sm:inline-flex"
              >
                <FastForward className="size-3.5" />
                <span>{t("player.skipIntro")}</span>
              </button>
            )}
            <div className="group/vol flex items-center">
              <CtrlButton
                label={muted ? t("player.unmute") : t("player.mute")}
                shortcutHint={`${muted ? t("player.unmute") : t("player.mute")} (M)`}
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
                aria-label={t("player.volume")}
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
                title={t("player.autoNextTitle")}
                className={cn(
                  "hidden min-h-[36px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition md:inline-flex",
                  autoNext
                    ? "border-cerulean/50 bg-cerulean/20 text-foreground"
                    : "border-foreground/15 bg-foreground/5 text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{autoNext ? t("player.autoNextOn") : t("player.autoNextOff")}</span>
              </button>
            )}

            {hasServerMenu && (
              <div className="relative">
                <CtrlButton
                  label={t("player.switchServer")}
                  shortcutHint={t("player.switchServer")}
                  onClick={() => setMenu((m) => (m === "servers" ? null : "servers"))}
                >
                  <Server className={cn(menu === "servers" && "text-cerulean")} />
                </CtrlButton>
                {menu === "servers" && (
                  <div
                    role="menu"
                    aria-label={t("player.streamServers")}
                    className="absolute bottom-12 right-0 max-h-72 w-56 overflow-y-auto rounded-xl border border-foreground/10 bg-popover/95 p-2 text-sm shadow-card backdrop-blur-xl"
                  >
                    <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {t("player.streamServers")}
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
                            {t("watch.server3Embed")}
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
                label={t("player.shortcuts")}
                shortcutHint={`${t("player.shortcuts")} (?)`}
                keyShortcuts="?"
                onClick={() => setShortcutsOpen((o) => !o)}
              >
                <Keyboard />
              </CtrlButton>
            </div>
            <div className="relative">
              <CtrlButton
                label={t("player.settings")}
                onClick={() => setMenu((m) => (m === "settings" ? null : "settings"))}
              >
                <Settings className={cn("transition", menu === "settings" && "rotate-45")} />
              </CtrlButton>
              {menu === "settings" && (
                <div className="absolute bottom-12 right-0 max-h-72 w-60 overflow-y-auto rounded-xl border border-foreground/10 bg-popover/95 p-2 text-sm shadow-card backdrop-blur-xl">
                  {hasServerMenu && (
                    <>
                      <p className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        <Server className="size-3" /> {t("player.server")} · {currentSource.label}
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
                          <span>{t("watch.server3Embed")}</span>
                        </MenuItem>
                      )}
                      <div className="my-1.5 h-px bg-foreground/10" />
                    </>
                  )}
                  {audioTracks.length > 1 && (
                    <>
                      <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {t("player.audioTrack")}
                      </p>
                      {audioTracks.map((tr) => (
                        <MenuItem
                          key={`audio-${tr.id}`}
                          active={audioTrackIndex === tr.id}
                          onClick={() => chooseAudioTrack(tr.id)}
                        >
                          <span className="truncate">{tr.name}</span>
                        </MenuItem>
                      ))}
                      <div className="my-1.5 h-px bg-foreground/10" />
                    </>
                  )}
                  {levels.length > 0 && (
                    <>
                      <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {t("player.quality")} · {currentQuality}
                      </p>
                      <MenuItem active={level === -1} onClick={() => chooseLevel(-1)}>
                        {t("player.auto")}
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
                        <Captions className="size-3" /> {t("player.subtitles")} (C)
                      </p>
                      <MenuItem active={subTrack === -1} onClick={() => setSubTrack(-1)}>
                        {t("player.off")}
                      </MenuItem>
                      {subtitles.map((track, i) => (
                        <MenuItem
                          key={track.url}
                          active={subTrack === i}
                          onClick={() => setSubTrack(i)}
                        >
                          <span className="truncate">{track.label}</span>
                        </MenuItem>
                      ))}
                      <div className="my-1.5 h-px bg-foreground/10" />
                    </>
                  )}
                  <p className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Gauge className="size-3" /> {t("player.speed")}
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
                        <span>{t("player.autoPlayNextMenu")}</span>
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
                    <span>{t("player.shortcuts")} (?)</span>
                  </MenuItem>
                </div>
              )}
            </div>
            <div className="hidden sm:block">
              <CtrlButton label={t("player.pip")} onClick={() => void togglePip()}>
                <PictureInPicture2 />
              </CtrlButton>
            </div>
            <CtrlButton
              label={fullscreen ? t("player.exitFullScreen") : t("player.fullScreen")}
              shortcutHint={`${fullscreen ? t("player.exitFullScreen") : t("player.fullScreen")} (F)`}
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
