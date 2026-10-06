"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const MAX_SECONDS = 300; // 5 minutes
const MIN_MS = 700; // shorter taps are discarded
const BITRATE = 128_000; // clear speech (WhatsApp voice notes use far less); ~1 MB per minute

/**
 * Mic settings for voice notes. Echo cancellation is for calls (nothing plays while you record)
 * and makes voices sound muffled, so it's off; noise suppression and automatic gain stay on to
 * keep background noise down and quiet voices audible.
 */
const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48_000 },
};

// Formats in order of preference; Safari records audio/mp4, Firefox audio/ogg.
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function fileFor(blobType: string): { ext: string; type: string } {
  if (blobType.includes("ogg")) return { ext: "ogg", type: "audio/ogg" };
  if (blobType.includes("mp4") || blobType.includes("aac")) return { ext: "m4a", type: "audio/mp4" };
  return { ext: "weba", type: "audio/webm" };
}

const noopSubscribe = () => () => {};

type State = "idle" | "starting" | "recording";

/** Records a voice note with MediaRecorder and hands back a File when sent. */
export function useVoiceRecorder({
  onComplete,
  onError,
}: {
  onComplete: (file: File) => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = useRef(false);
  const callbacks = useRef({ onComplete, onError });
  useEffect(() => {
    callbacks.current = { onComplete, onError };
  });

  // Known only in the browser (after hydration).
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  };

  const finish = useCallback((discard: boolean) => {
    const rec = recorderRef.current;
    discardRef.current = discard;
    if (rec && rec.state !== "inactive") rec.stop();
    else cleanup();
    setState("idle");
    setElapsed(0);
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    setState("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
    } catch (err) {
      setState("idle");
      const name = (err as DOMException)?.name;
      callbacks.current.onError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access is blocked. Allow it in your browser settings to send voice messages."
          : name === "NotFoundError"
            ? "No microphone was found on this device."
            : "Couldn't start recording. Please try again.",
      );
      return;
    }

    const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t));
    const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: BITRATE });
    chunksRef.current = [];
    discardRef.current = false;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const tookMs = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType || "audio/webm" });
      cleanup();
      if (discardRef.current) return;
      if (tookMs < MIN_MS || blob.size === 0) {
        callbacks.current.onError("That was too short. Tap the mic, speak, then tap send.");
        return;
      }
      const { ext, type } = fileFor(blob.type);
      callbacks.current.onComplete(new File([blob], `voice-${Date.now()}.${ext}`, { type }));
    };

    recorderRef.current = rec;
    streamRef.current = stream;
    startedAtRef.current = Date.now();
    rec.start(250);
    setElapsed(0);
    setState("recording");
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(secs);
      if (secs >= MAX_SECONDS) finish(false); // auto-send at the limit
    }, 250);
  }, [state, finish]);

  // Stop the microphone if the component goes away mid-recording.
  useEffect(() => () => finish(true), [finish]);

  return {
    supported,
    state,
    elapsed,
    maxSeconds: MAX_SECONDS,
    start,
    send: () => finish(false),
    cancel: () => finish(true),
  };
}
