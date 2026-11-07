"use client";

import { useEffect, useRef, useState } from "react";
import { MaximizeIcon, VideoIcon, VolumeIcon, VolumeOffIcon, XIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { LIVE_REACTIONS } from "@/lib/types";
import type { GuestStatus, LiveWatch } from "./useLiveVideo";
import { FloatingReactions, useFloatingReactions } from "./FloatingReactions";

const REACT_GAP_MS = 250; // keeps rapid taps under the server's rate limit

/** Floating window showing another member's video recording as it happens. */
export function LiveViewer({
  watch,
  onClose,
  onReact,
  selfStream,
  cameraStatus,
  onJoinCamera,
  onLeaveCamera,
}: {
  watch: LiveWatch;
  onClose: () => void;
  onReact: (emoji: string) => void;
  /** My own camera while I've joined the video. */
  selfStream: MediaStream | null;
  cameraStatus: GuestStatus;
  onJoinCamera: () => void;
  onLeaveCamera: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const selfRef = useRef<HTMLVideoElement>(null);
  const cameraOn = cameraStatus !== "idle";

  useEffect(() => {
    const el = selfRef.current;
    if (!el) return;
    el.srcObject = selfStream;
    if (selfStream) el.play().catch(() => {});
  }, [selfStream]);
  const floating = useFloatingReactions();
  const lastReactAt = useRef(0);

  const react = (emoji: string, now: number) => {
    if (now - lastReactAt.current < REACT_GAP_MS) return;
    lastReactAt.current = now;
    floating.add(emoji); // instant feedback on my side
    onReact(emoji);
  };
  // Starts muted so the browser allows autoplay; one tap turns the sound on.
  const [muted, setMuted] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (watch.player) {
      // Server relay: MediaSource playback.
      watch.player.attach(el);
      el.play().catch(() => {});
      return;
    }
    if (el.getAttribute("src")) el.removeAttribute("src");
    el.srcObject = watch.stream;
    if (watch.stream) el.play().catch(() => {});
  }, [watch.stream, watch.player]);

  const toggleSound = () => {
    const el = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (el) {
      el.muted = next;
      el.play().catch(() => {});
    }
  };

  const showVideo =
    watch.status !== "failed" && (watch.mode === "relay" ? watch.status === "live" : !!watch.stream);

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
        {watch.status === "live" && (
          <button
            type="button"
            onClick={() => {
              if (cameraOn) return onLeaveCamera();
              // Joining is a conversation: turn their sound on too (this tap allows it).
              if (muted) toggleSound();
              onJoinCamera();
            }}
            disabled={cameraStatus === "starting"}
            className={`grid size-8 place-items-center rounded-full transition disabled:opacity-60 ${
              cameraOn ? "bg-red-600 hover:bg-red-500" : "hover:bg-white/15"
            }`}
            aria-label={cameraOn ? "Turn my camera off" : "Join with my camera"}
            aria-pressed={cameraOn}
            title={cameraOn ? "Turn my camera off" : "Join with my camera"}
          >
            {cameraStatus === "starting" ? <Spinner className="size-4" /> : <VideoIcon className="size-4" />}
          </button>
        )}
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
        {selfStream && (
          <div
            className={`animate-fade-in absolute bottom-2 left-2 overflow-hidden rounded-lg bg-black ring-1 ring-white/70 ${
              expanded ? "w-32 sm:w-44" : "w-14 sm:w-20"
            }`}
          >
            <video
              ref={selfRef}
              muted
              playsInline
              autoPlay
              className="aspect-[3/4] w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            {cameraStatus === "connecting" && (
              <span className="absolute inset-0 grid place-items-center bg-black/40">
                <Spinner className="size-4 text-white" />
              </span>
            )}
          </div>
        )}
        <FloatingReactions items={floating.items} size={expanded ? "lg" : "sm"} />
        {!showVideo && (
          <div className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-white/70">
            {watch.status === "failed" ? (
              "Live video can't play on this device. It will arrive as a message when they send it."
            ) : (
              <span className="flex flex-col items-center gap-2">
                <Spinner className="size-5" />
                {watch.mode === "relay" ? "Loading live video…" : "Connecting…"}
              </span>
            )}
          </div>
        )}
      </div>
      {watch.status !== "failed" && (
        <div
          className={`scrollbar-dark flex gap-0.5 overflow-x-auto px-1.5 py-1.5 ${expanded ? "justify-center pb-3" : ""}`}
          role="group"
          aria-label={`Send ${watch.fromName} a reaction`}
        >
          {LIVE_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={(e) => react(emoji, e.timeStamp)}
              className={`grid shrink-0 place-items-center rounded-full transition hover:bg-white/15 active:scale-90 ${
                expanded ? "size-11 text-2xl" : "size-8 text-lg"
              }`}
              aria-label={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
