"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

const STORAGE_KEY = "talkroom:bell";
const SOUND_URL = "/sounds/bell.wav";

// Per-browser preference, so each person controls their own bell.
// Falls back to memory when storage is blocked (private mode, disabled site data).
let memoryValue: boolean | null = null;
const listeners = new Set<() => void>();

function readEnabled() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored !== "off";
  } catch {
    /* storage unavailable */
  }
  return memoryValue ?? true;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener); // keep other tabs in sync
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function writeEnabled(on: boolean) {
  memoryValue = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable: memory value still applies for this page */
  }
  listeners.forEach((l) => l());
}

/** Message bell: `ring()` plays the sound when enabled; `toggle()` switches it on/off. */
export function useBell() {
  // Server render assumes "on"; the real value is read after hydration.
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(SOUND_URL);
      audioRef.current.preload = "auto";
      audioRef.current.volume = 0.7;
    }
    return audioRef.current;
  }, []);

  // Browsers only allow sound after a user gesture: silently "unlock" audio on the first tap/key.
  useEffect(() => {
    const unlock = () => {
      const a = audio();
      a.muted = true;
      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
        })
        .catch(() => {})
        .finally(() => {
          a.muted = false;
        });
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [audio]);

  const play = useCallback(() => {
    const a = audio();
    a.currentTime = 0;
    void a.play().catch(() => {}); // blocked until the first user gesture; ignore
  }, [audio]);

  const ring = useCallback(() => {
    if (readEnabled()) play();
  }, [play]);

  const toggle = useCallback(() => {
    const next = !readEnabled();
    writeEnabled(next);
    if (next) play(); // preview the sound when turning it on
    return next;
  }, [play]);

  return { enabled, ring, toggle };
}
