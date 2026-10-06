"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";

const PLAY_EVENT = "talkroom:audio-play";
const noopSubscribe = () => () => {};

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Compact voice-note player: play/pause, seek bar and time.
 * `tinted` = inside my colored bubble (uses the bubble's text color).
 */
export function VoicePlayer({ src, tinted }: { src: string; tinted: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fixingDuration = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  // Attach the source only after hydration: otherwise a server-rendered <audio> can load its
  // metadata before React listens, and the duration event is missed (shows 0:00).
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

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
    if (Number.isFinite(a.duration)) {
      setDuration(a.duration);
    } else {
      // Browser recordings (WebM) often report an unknown length until read once: seek far
      // ahead to make the browser compute it, then come back to the start.
      fixingDuration.current = true;
      a.currentTime = 1e101;
    }
  };

  const onDurationChange = () => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.duration)) return;
    setDuration(a.duration);
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

  const seek = (value: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = value;
    setCurrent(value);
  };

  return (
    <div className="flex w-56 max-w-full items-center gap-3 py-0.5 sm:w-64">
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
        <input
          type="range"
          min={0}
          max={duration ?? 0}
          step={0.01}
          value={Math.min(current, duration ?? 0)}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={!duration}
          aria-label="Seek voice message"
          style={{ accentColor: tinted ? "var(--bubble-fg)" : "#4f46e5" }}
          className="block h-1.5 w-full cursor-pointer disabled:cursor-default"
        />
        <span
          style={tinted ? { color: "var(--bubble-fg)", opacity: 0.75 } : undefined}
          className={`mt-1 block text-[11px] tabular-nums ${tinted ? "" : "text-neutral-500"}`}
        >
          {playing || current > 0 ? formatDuration(current) : formatDuration(duration)}
        </span>
      </div>
    </div>
  );
}
