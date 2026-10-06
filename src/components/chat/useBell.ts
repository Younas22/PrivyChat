"use client";

import { useCallback, useEffect, useRef } from "react";
import { readFlag, usePersistentFlag, writeFlag } from "@/lib/client/usePersistentFlag";

const STORAGE_KEY = "talkroom:bell";
const SOUND_URL = "/sounds/bell.wav";

/** Message bell: `ring()` plays the sound when enabled; `toggle()` switches it on/off. */
export function useBell() {
  // Each person's own choice, kept in their browser (on by default).
  const [enabled] = usePersistentFlag(STORAGE_KEY, true);
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
    if (readFlag(STORAGE_KEY, true)) play();
  }, [play]);

  const toggle = useCallback(() => {
    const next = !readFlag(STORAGE_KEY, true);
    writeFlag(STORAGE_KEY, next);
    if (next) play(); // preview the sound when turning it on
    return next;
  }, [play]);

  return { enabled, ring, toggle };
}
