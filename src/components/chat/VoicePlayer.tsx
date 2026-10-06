"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";
import { WAVE_BARS } from "@/lib/client/audioAnalysis";

const PLAY_EVENT = "talkroom:audio-play";
const noopSubscribe = () => () => {};

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Bar heights 0-1 from the stored waveform, or a gentle placeholder for older messages. */
function barLevels(waveform: string | null, seed: string) {
  if (waveform) return [...waveform].map((c) => parseInt(c, 32) / 31);
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: WAVE_BARS }, () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 0.25 + ((h >>> 16) % 1000) / 2000; // 0.25-0.75
  });
}

interface VoicePlayerProps {
  src: string;
  /** Inside my colored bubble: draw with the bubble's text color. */
  tinted: boolean;
  /** Exact length measured when it was sent (null for older messages). */
  durationMs: number | null;
  waveform: string | null;
}

/** WhatsApp-style voice note: play/pause, loudness waveform you can tap or drag to seek, exact time. */
export function VoicePlayer({ src, tinted, durationMs, waveform }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const fixingDuration = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [metaDuration, setMetaDuration] = useState<number | null>(null);
  // Attach the source only after hydration so a server-rendered <audio> can't fire its
  // metadata events before React is listening.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const levels = useMemo(() => barLevels(waveform, src), [waveform, src]);
  // Prefer the exact stored length; fall back to what the file reports.
  const duration = durationMs ? durationMs / 1000 : metaDuration;
  const progress = duration ? Math.min(1, current / duration) : 0;
  const started = playing || current > 0;

  // Only one voice note plays at a time.
  useEffect(() => {
    const onOtherPlay = (e: Event) => {
      const a = audioRef.current;
      if (a && (e as CustomEvent).detail !== a && !a.paused) a.pause();
    };
    window.addEventListener(PLAY_EVENT, onOtherPlay);
    return () => window.removeEventListener(PLAY_EVENT, onOtherPlay);
  }, []);

  const onLoadedMetadata = () => {
    const a = audioRef.current;
    if (!a) return;
    if (Number.isFinite(a.duration)) setMetaDuration(a.duration);
    else if (!durationMs) {
      // Browser recordings (WebM) may not know their length until read once.
      fixingDuration.current = true;
      a.currentTime = 1e101;
    }
  };

  const onDurationChange = () => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.duration)) return;
    setMetaDuration(a.duration);
    if (fixingDuration.current) {
      fixingDuration.current = false;
      a.currentTime = 0;
    }
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: a }));
      void a.play().catch(() => setPlaying(false));
    } else {
      a.pause();
    }
  };

  const seekTo = (seconds: number) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const t = Math.max(0, Math.min(duration, seconds));
    a.currentTime = t;
    setCurrent(t);
  };

  const seekFromPointer = (clientX: number) => {
    const rect = barsRef.current?.getBoundingClientRect();
    if (!rect || !duration) return;
    seekTo(((clientX - rect.left) / rect.width) * duration);
  };

  const fg = tinted ? "var(--bubble-fg)" : "#4f46e5";

  return (
    <div className="flex w-60 max-w-full items-center gap-3 py-0.5 sm:w-72">
      <audio
        ref={audioRef}
        src={hydrated ? src : undefined}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={onDurationChange}
        onTimeUpdate={() => !fixingDuration.current && setCurrent(audioRef.current?.currentTime ?? 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        style={tinted ? { backgroundColor: "color-mix(in srgb, var(--bubble-fg) 20%, transparent)", color: "var(--bubble-fg)" } : undefined}
        className={`grid size-10 shrink-0 place-items-center rounded-full transition hover:scale-105 ${
          tinted ? "" : "bg-indigo-600 text-white"
        }`}
      >
        {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4 translate-x-px" />}
      </button>

      <div className="min-w-0 flex-1">
        {/* Waveform: taller bars = louder. Played part is solid; tap or drag to seek. */}
        <div
          ref={barsRef}
          role="slider"
          tabIndex={0}
          aria-label="Voice message position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration ?? 0)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${formatDuration(current)} of ${formatDuration(duration)}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromPointer(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromPointer(e.clientX);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") seekTo(current + 5);
            else if (e.key === "ArrowLeft") seekTo(current - 5);
            else return;
            e.preventDefault();
          }}
          className="flex h-8 cursor-pointer touch-none items-center gap-[2px] rounded focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: fg }}
        >
          {levels.map((level, i) => {
            const played = (i + 0.5) / levels.length <= progress;
            return (
              <span
                key={i}
                className="min-w-[2px] flex-1 rounded-full transition-opacity"
                style={{
                  height: `${Math.max(12, Math.round(level * 100))}%`,
                  backgroundColor: fg,
                  opacity: played ? 1 : 0.35,
                }}
              />
            );
          })}
        </div>
        <span
          style={tinted ? { color: "var(--bubble-fg)", opacity: 0.75 } : undefined}
          className={`mt-0.5 block text-[11px] tabular-nums ${tinted ? "" : "text-neutral-500"}`}
        >
          {started ? `${formatDuration(current)} / ${formatDuration(duration)}` : formatDuration(duration)}
        </span>
      </div>
    </div>
  );
}
