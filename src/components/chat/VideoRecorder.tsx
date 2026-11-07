"use client";

import { useEffect, useRef, useState } from "react";
import {
  GripIcon,
  MaximizeIcon,
  MinimizeIcon,
  SendIcon,
  SwitchCameraIcon,
  TrashIcon,
  XIcon,
} from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { createComposite, type Composite } from "@/lib/client/videoComposite";
import { FloatingReactions, ReactionBar, useFloatingReactions } from "./FloatingReactions";
import { useDraggable } from "./useDraggable";
import type { GuestFeed, LiveReaction } from "./useLiveVideo";

const VIDEO_BPS = 1_500_000;
const AUDIO_BPS = 96_000;
const MAX_SECONDS_CAP = 300; // 5 minutes
const MIN_MS = 1000;

// Chrome / Firefox record WebM; Safari only MP4.
const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
];

interface VideoRecorderProps {
  maxBytes: number;
  /** Someone else is in the room who could watch live. */
  liveAvailable: boolean;
  viewerCount: number;
  /** Latest emoji sent by someone watching live. */
  reaction: LiveReaction | null;
  /** A viewer who joined with their camera (shown picture-in-picture and recorded too). */
  guest: GuestFeed | null;
  /** Sends an emoji to everyone watching. */
  onReact: (emoji: string) => void;
  onStartLive: (stream: MediaStream) => void;
  onStopLive: () => void;
  onSend: (file: File) => void;
  onClose: () => void;
  onError: (message: string) => void;
}

type Phase = "preview" | "recording" | "review";

const fmt = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

/** Full-screen camera: record a video message, optionally streamed live to the other members. */
export function VideoRecorder({
  maxBytes,
  liveAvailable,
  viewerCount,
  reaction,
  guest,
  onReact,
  onStartLive,
  onStopLive,
  onSend,
  onClose,
  onError,
}: VideoRecorderProps) {
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("preview");
  const [elapsed, setElapsed] = useState(0);
  const [shareLive, setShareLive] = useState(true);
  const [result, setResult] = useState<{ file: File; url: string } | null>(null);
  const [cameraCount, setCameraCount] = useState(0);
  const [mini, setMini] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);
  const guestRef = useRef<HTMLVideoElement>(null);
  const compositeRef = useRef<Composite | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = useRef(false);
  const callbacks = useRef({ onError, onClose, onStopLive });
  useEffect(() => {
    callbacks.current = { onError, onClose, onStopLive };
  });

  const maxSeconds = Math.max(
    5,
    Math.min(MAX_SECONDS_CAP, Math.floor((maxBytes * 0.9) / ((VIDEO_BPS + AUDIO_BPS) / 8))),
  );
  const needCamera = phase !== "review";

  // Viewers' emojis float up over the camera while recording.
  const floating = useFloatingReactions();
  const [lastReaction, setLastReaction] = useState<LiveReaction | null>(null);
  const seenReaction = useRef(reaction?.id ?? 0);
  const addFloating = floating.add;
  useEffect(() => {
    if (!reaction || reaction.id === seenReaction.current) return;
    seenReaction.current = reaction.id;
    if (phase !== "recording") return;
    addFloating(reaction.emoji, reaction.fromName);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- announces an external event
    setLastReaction(reaction);
  }, [reaction, phase, addFloating]);

  // Camera + mic (re-acquired when flipping cameras or retaking).
  useEffect(() => {
    if (!needCamera) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      callbacks.current.onError("Video recording isn't supported in this browser.");
      callbacks.current.onClose();
      return;
    }
    let cancelled = false;
    let acquired: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        acquired = s;
        setStream(s);
        navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => setCameraCount(devices.filter((d) => d.kind === "videoinput").length))
          .catch(() => {});
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = (err as DOMException)?.name;
        callbacks.current.onError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera access is blocked. Allow camera and microphone in your browser settings to record video."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera was found on this device."
              : "Couldn't open the camera. Please try again.",
        );
        callbacks.current.onClose();
      });
    return () => {
      cancelled = true;
      acquired?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [facing, needCamera]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) el.play().catch(() => {});
  }, [stream]);

  // The guest's camera: shown picture-in-picture, heard, and mixed into the recording.
  const showGuest = phase === "recording" && !!guest;
  useEffect(() => {
    const el = guestRef.current;
    if (!el || !guest) {
      compositeRef.current?.setGuestAudio(null);
      return;
    }
    if (guest.player) {
      guest.player.attach(el);
    } else {
      if (el.getAttribute("src")) el.removeAttribute("src");
      el.srcObject = guest.stream;
    }
    el.play().catch(() => {});
    compositeRef.current?.setGuestAudio(guest.player ? { element: el } : { stream: guest.stream });
  }, [guest, showGuest]);

  // Release the recorded clip's object URL.
  useEffect(() => {
    if (!result) return;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  const stopRecorder = (discard: boolean) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    discardRef.current = discard;
    const rec = recRef.current;
    recRef.current = null;
    if (rec && rec.state !== "inactive") rec.stop();
    else stopComposite();
    callbacks.current.onStopLive();
  };

  const stopComposite = () => {
    compositeRef.current?.stop();
    compositeRef.current = null;
  };

  // Leaving mid-recording discards it and ends the live stream.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only; stopRecorder uses refs
  useEffect(() => () => stopRecorder(true), []);

  const start = () => {
    if (!stream || phase !== "preview") return;
    const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t));
    // When others can watch (and join with their camera), record a composite so a guest who
    // joins later appears in the saved video too. Otherwise record the camera as-is.
    let source = stream;
    if (shareLive && liveAvailable && previewRef.current) {
      const composite = createComposite(previewRef.current, () => guestRef.current, stream);
      if (composite) {
        compositeRef.current = composite;
        source = composite.stream;
      }
    }
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(source, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: VIDEO_BPS,
        audioBitsPerSecond: AUDIO_BPS,
      });
    } catch {
      stopComposite();
      return onError("Couldn't start recording. Please try again.");
    }
    chunksRef.current = [];
    discardRef.current = false;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stopComposite();
      if (discardRef.current) return;
      const took = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType || "video/webm" });
      chunksRef.current = [];
      if (took < MIN_MS || blob.size === 0) {
        callbacks.current.onError("That was too short. Tap record, then tap stop when you're done.");
        return setPhase("preview");
      }
      if (blob.size > maxBytes) {
        callbacks.current.onError("This video is too large to send. Try a shorter clip.");
        return setPhase("preview");
      }
      const mp4 = blob.type.includes("mp4");
      const file = new File([blob], `video-${Date.now()}.${mp4 ? "mp4" : "webm"}`, {
        type: mp4 ? "video/mp4" : "video/webm",
      });
      setResult({ file, url: URL.createObjectURL(file) });
      setPhase("review");
    };
    recRef.current = rec;
    startedAtRef.current = Date.now();
    rec.start(500);
    setElapsed(0);
    setMini(false); // every recording starts full screen
    setPhase("recording");
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(secs);
      if (secs >= maxSeconds) stopRecorder(false);
    }, 250);
    if (shareLive && liveAvailable) onStartLive(stream);
  };

  const retake = () => {
    setResult(null);
    setElapsed(0);
    setPhase("preview");
  };

  const send = () => {
    if (!result) return;
    onSend(result.file);
    onClose();
  };

  // Small screen: a draggable floating window while recording, so the chat stays usable.
  const isMini = mini && phase === "recording";
  const { ref: dragRef, style: dragStyle, handlers: dragHandlers, dragClass } = useDraggable<HTMLDivElement>(isMini);
  const miniRef = useRef(isMini);
  useEffect(() => {
    miniRef.current = isMini;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never discard a recording from the small window by accident.
      if (e.key === "Escape" && !miniRef.current) callbacks.current.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const live = phase === "recording" && shareLive && liveAvailable;

  const reactAsHost = (emoji: string) => {
    floating.add(emoji); // instant feedback on my side
    onReact(emoji);
  };

  const iconBtn = "grid size-11 place-items-center rounded-full bg-white/10 transition hover:bg-white/20";
  const miniBtn = "grid size-8 shrink-0 place-items-center rounded-full transition hover:bg-white/15";

  // The camera, guest and reactions. Rendered at the same place in the tree in both sizes so the
  // <video> elements (and the recording drawn from them) survive switching between sizes.
  const stage =
    phase === "review" && result ? (
      <video src={result.url} controls autoPlay playsInline className="size-full object-contain" />
    ) : (
      <>
        <video
          ref={previewRef}
          muted
          playsInline
          autoPlay
          className="pointer-events-none size-full object-contain"
          style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
        />
        {!stream && (
          <div className="absolute inset-0 grid place-items-center">
            <Spinner className="size-8 text-white/70" />
          </div>
        )}
        {showGuest && (
          <div
            className={`animate-fade-in absolute overflow-hidden bg-black shadow-2xl ${
              isMini
                ? "top-1.5 right-1.5 w-[36%] rounded-lg ring-1 ring-white/80"
                : "top-3 right-3 w-[30%] max-w-52 min-w-28 rounded-xl ring-2 ring-white/80"
            }`}
          >
            <video ref={guestRef} playsInline autoPlay className="pointer-events-none aspect-[3/4] w-full object-cover" />
            {!isMini && (
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 px-2 pt-3 pb-1 text-[11px] font-medium">
                {guest?.name}
              </span>
            )}
          </div>
        )}
        {phase === "recording" && <FloatingReactions items={floating.items} size={isMini ? "sm" : "lg"} />}
        <span className="sr-only" aria-live="polite">
          {lastReaction ? `${lastReaction.fromName} reacted ${lastReaction.emoji}` : ""}
        </span>
      </>
    );

  const miniHeader = (
        <div className="flex items-center gap-1 py-1.5 pr-2 pl-1" role="status" aria-live="polite">
          <GripIcon className="size-4 shrink-0 text-white/50" />
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold tabular-nums">
            <span className="size-1.5 animate-pulse rounded-full bg-white" />
            {fmt(elapsed)}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {live ? (guest ? `with ${guest.name}` : viewerCount > 0 ? `${viewerCount} watching` : "LIVE") : "Recording"}
          </span>
          <button
            type="button"
            onClick={() => setMini(false)}
            className={miniBtn}
            aria-label="Full screen"
            title="Full screen"
          >
            <MaximizeIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => stopRecorder(false)}
            className={`${miniBtn} bg-red-600 hover:bg-red-500`}
            aria-label="End and stop recording"
            title="End"
          >
            <span className="size-3 rounded-[3px] bg-white" />
          </button>
        </div>
  );

  return (
    <div
      ref={dragRef}
      style={dragStyle}
      {...dragHandlers}
      className={
        isMini
          ? `animate-slide-up fixed right-3 bottom-28 z-40 w-52 overflow-hidden rounded-2xl bg-black text-white shadow-2xl ring-1 ring-white/10 sm:right-6 sm:w-64 ${dragClass}`
          : "animate-fade-in fixed inset-0 z-50 flex flex-col bg-black pt-[env(safe-area-inset-top)] pb-[max(1rem,env(safe-area-inset-bottom))] text-white"
      }
      role={isMini ? "region" : "dialog"}
      aria-modal={isMini ? undefined : true}
      aria-label={isMini ? "Recording a video" : "Record a video"}
    >
      {isMini ? miniHeader : (
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
          aria-label={phase === "recording" ? "Discard recording" : "Close camera"}
        >
          <XIcon className="size-5" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-2" role="status" aria-live="polite">
          {phase === "recording" && (
            <>
              <span className="flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-sm font-semibold tabular-nums">
                <span className="size-2 animate-pulse rounded-full bg-white" />
                {fmt(elapsed)} / {fmt(maxSeconds)}
              </span>
              {live && (
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide">
                  LIVE ·{" "}
                  {guest ? `with ${guest.name}` : viewerCount > 0 ? `${viewerCount} watching` : "waiting for viewers"}
                </span>
              )}
            </>
          )}
          {phase === "review" && <span className="text-sm font-medium">Preview</span>}
        </div>
        {phase === "preview" && cameraCount > 1 ? (
          <button
            type="button"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            className={iconBtn}
            aria-label="Switch camera"
          >
            <SwitchCameraIcon className="size-5" />
          </button>
        ) : phase === "recording" ? (
          <button
            type="button"
            onClick={() => setMini(true)}
            className={iconBtn}
            aria-label="Small screen"
            title="Small screen (keep chatting while recording)"
          >
            <MinimizeIcon className="size-5" />
          </button>
        ) : (
          <span className="size-11" />
        )}
      </div>
      )}

      <div className={isMini ? "relative aspect-[3/4] bg-black sm:aspect-video" : "relative min-h-0 flex-1"}>
        {stage}
      </div>

      {isMini ? (
        live && <ReactionBar onReact={reactAsHost} label="Send everyone watching a reaction" />
      ) : (
      <div className="flex flex-col items-center gap-3 px-4 pt-3">
        {live && <ReactionBar onReact={reactAsHost} large label="Send everyone watching a reaction" />}
        {phase === "preview" && liveAvailable && (
          <label className="flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm select-none">
            <input
              type="checkbox"
              checked={shareLive}
              onChange={(e) => setShareLive(e.target.checked)}
              className="size-4 accent-red-500"
            />
            Let others in the room watch live
          </label>
        )}

        {phase === "review" ? (
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={retake}
              className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-medium transition hover:bg-white/20"
            >
              <TrashIcon className="size-5" />
              Retake
            </button>
            <button
              type="button"
              onClick={send}
              className="flex h-12 items-center gap-2 rounded-full bg-tr-primary px-6 text-sm font-semibold shadow-lg shadow-tr-primary/30 transition hover:bg-tr-primary-2"
            >
              <SendIcon className="size-5" />
              Send
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={phase === "recording" ? () => stopRecorder(false) : start}
            disabled={!stream}
            className="grid size-18 place-items-center rounded-full border-4 border-white transition disabled:opacity-50"
            aria-label={phase === "recording" ? "Stop recording" : "Start recording"}
          >
            <span
              className={`bg-red-600 transition-all ${phase === "recording" ? "size-7 rounded-md" : "size-14 rounded-full"}`}
            />
          </button>
        )}
      </div>
      )}
    </div>
  );
}
