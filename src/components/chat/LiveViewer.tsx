"use client";

import { useEffect, useRef, useState } from "react";
import { MaximizeIcon, VolumeIcon, VolumeOffIcon, XIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import type { LiveWatch } from "./useLiveVideo";

/** Floating window showing another member's video recording as it happens. */
export function LiveViewer({ watch, onClose }: { watch: LiveWatch; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Starts muted so the browser allows autoplay; one tap turns the sound on.
  const [muted, setMuted] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = watch.stream;
    if (watch.stream) el.play().catch(() => {});
  }, [watch.stream, expanded]);

  const toggleSound = () => {
    const el = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (el) {
      el.muted = next;
      el.play().catch(() => {});
    }
  };

  const showVideo = watch.status !== "failed" && watch.stream;

  return (
    <div
      className={
        expanded
          ? "animate-fade-in fixed inset-0 z-50 flex flex-col bg-black/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          : "animate-slide-up fixed right-3 bottom-28 z-40 w-48 overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10 sm:right-6 sm:w-64"
      }
      role="region"
      aria-label={`${watch.fromName} is recording a video live`}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-white">
        <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold tracking-wider">
          <span className="size-1.5 animate-pulse rounded-full bg-white" />
          LIVE
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{watch.fromName}</span>
        <button
          type="button"
          onClick={toggleSound}
          className="grid size-8 place-items-center rounded-full hover:bg-white/15"
          aria-label={muted ? "Turn sound on" : "Mute"}
        >
          {muted ? <VolumeOffIcon className="size-4" /> : <VolumeIcon className="size-4" />}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="grid size-8 place-items-center rounded-full hover:bg-white/15"
          aria-label={expanded ? "Shrink video" : "Expand video"}
        >
          <MaximizeIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-full hover:bg-white/15"
          aria-label="Stop watching"
        >
          <XIcon className="size-4" />
        </button>
      </div>
      <div className={`relative bg-black ${expanded ? "min-h-0 flex-1" : "aspect-[3/4] sm:aspect-video"}`}>
        <video
          ref={videoRef}
          muted={muted}
          playsInline
          autoPlay
          className={`size-full object-contain ${showVideo ? "" : "invisible"}`}
        />
        {!showVideo && (
          <div className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-white/70">
            {watch.status === "failed" ? (
              "Couldn't connect to the live video. It will arrive as a message when they send it."
            ) : (
              <span className="flex flex-col items-center gap-2">
                <Spinner className="size-5" />
                Connecting…
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
