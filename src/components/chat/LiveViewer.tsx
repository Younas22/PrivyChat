"use client";

import { useEffect, useRef, useState } from "react";
import { MaximizeIcon, VideoIcon, VolumeIcon, VolumeOffIcon, XIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import type { GuestStatus, LiveReaction, LiveWatch } from "./useLiveVideo";
import { FloatingReactions, ReactionBar, useFloatingReactions } from "./FloatingReactions";
import { useDraggable } from "./useDraggable";

/**
 * Floating window showing another member's video recording as it happens. Only the recorder can
 * end it; the viewer can shrink/expand it, drag it anywhere, react, and join with their camera.
 */
export function LiveViewer({
  watch,
  onClose,
  onReact,
  reaction,
  selfStream,
  cameraStatus,
  onJoinCamera,
  onLeaveCamera,
}: {
  watch: LiveWatch;
  /** Only offered when the video can't play here (nothing else to do with the window). */
  onClose: () => void;
  onReact: (emoji: string) => void;
  /** Latest emoji the recorder sent. */
  reaction: LiveReaction | null;
  /** My own camera while I've joined the video. */
  selfStream: MediaStream | null;
  cameraStatus: GuestStatus;
  onJoinCamera: () => void;
  onLeaveCamera: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const selfRef = useRef<HTMLVideoElement>(null);
  const cameraOn = cameraStatus !== "idle";
  // Starts muted so the browser allows autoplay; one tap turns the sound on.
  const [muted, setMuted] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const { ref: dragRef, style: dragStyle, handlers: dragHandlers, dragClass } = useDraggable<HTMLDivElement>(!expanded);
  const floating = useFloatingReactions();

  // The recorder's emojis float up here too.
  const seenReaction = useRef(reaction?.id ?? 0);
  const addFloating = floating.add;
  useEffect(() => {
    if (!reaction || reaction.id === seenReaction.current) return;
    seenReaction.current = reaction.id;
    addFloating(reaction.emoji, reaction.fromName);
  }, [reaction, addFloating]);

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

  useEffect(() => {
    const el = selfRef.current;
    if (!el) return;
    el.srcObject = selfStream;
    if (selfStream) el.play().catch(() => {});
  }, [selfStream]);

  const toggleSound = () => {
    const el = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (el) {
      el.muted = next;
      el.play().catch(() => {});
    }
  };

  const react = (emoji: string) => {
    floating.add(emoji); // instant feedback on my side
    onReact(emoji);
  };

  const failed = watch.status === "failed";
  const showVideo = !failed && (watch.mode === "relay" ? watch.status === "live" : !!watch.stream);
  const btn = "grid size-8 shrink-0 place-items-center rounded-full transition hover:bg-white/15";

  return (
    <div
      ref={dragRef}
      style={dragStyle}
      {...dragHandlers}
      className={`text-white ${dragClass} ${
        expanded
          ? "animate-fade-in fixed inset-0 z-50 flex flex-col bg-black/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          : "animate-slide-up fixed right-3 bottom-28 z-40 w-52 overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10 sm:right-6 sm:w-64"
      }`}
      role="region"
      aria-label={`${watch.fromName} is recording a video live`}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold tracking-wider">
          <span className="size-1.5 animate-pulse rounded-full bg-white" />
          LIVE
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{watch.fromName}</span>
        <button type="button" onClick={toggleSound} className={btn} aria-label={muted ? "Turn sound on" : "Mute"}>
          {muted ? <VolumeOffIcon className="size-4" /> : <VolumeIcon className="size-4" />}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={btn}
          aria-label={expanded ? "Small screen" : "Full screen"}
          title={expanded ? "Small screen" : "Full screen"}
        >
          <MaximizeIcon className="size-4" />
        </button>
        {failed && (
          <button type="button" onClick={onClose} className={btn} aria-label="Close">
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      <div className={`relative bg-black ${expanded ? "min-h-0 flex-1" : "aspect-[3/4] sm:aspect-video"}`}>
        <video
          ref={videoRef}
          muted={muted}
          playsInline
          autoPlay
          className={`pointer-events-none size-full object-contain ${showVideo ? "" : "invisible"}`}
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
              className="pointer-events-none aspect-[3/4] w-full object-cover"
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
            {failed ? (
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

      {watch.status === "live" && (
        <div className={`px-2 pt-2 ${expanded ? "flex justify-center" : ""}`}>
          <button
            type="button"
            onClick={() => {
              if (cameraOn) return onLeaveCamera();
              // Joining is a conversation: turn their sound on too (this tap allows it).
              if (muted) toggleSound();
              onJoinCamera();
            }}
            disabled={cameraStatus === "starting"}
            aria-pressed={cameraOn}
            className={`flex items-center justify-center gap-2 rounded-full font-semibold shadow-lg transition active:scale-[0.97] disabled:opacity-70 ${
              expanded ? "h-12 px-8 text-base" : "h-10 w-full px-3 text-sm"
            } ${
              cameraOn
                ? "bg-red-600 text-white shadow-red-600/30 hover:bg-red-500"
                : "bg-emerald-500 text-white shadow-emerald-500/30 ring-2 ring-emerald-300/60 hover:bg-emerald-400"
            }`}
          >
            {cameraStatus === "starting" ? (
              <Spinner className="size-4" />
            ) : (
              <span className="relative grid place-items-center">
                {!cameraOn && (
                  <span className="absolute size-full animate-ping rounded-full bg-white/40 motion-reduce:hidden" />
                )}
                <VideoIcon className="relative size-5" />
              </span>
            )}
            {cameraStatus === "starting"
              ? "Opening camera…"
              : cameraStatus === "connecting"
                ? "Connecting… (tap to stop)"
                : cameraOn
                  ? "Turn my camera off"
                  : "Join with video"}
          </button>
        </div>
      )}

      {!failed && (
        <div className={expanded ? "pb-3" : ""}>
          <ReactionBar onReact={react} large={expanded} label={`Send ${watch.fromName} a reaction`} />
        </div>
      )}
    </div>
  );
}
