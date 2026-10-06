"use client";

import { useCallback, useSyncExternalStore } from "react";

// A boolean preference kept in this browser (localStorage), with an in-memory fallback when
// storage is blocked. Server render uses the default; the stored value applies after hydration.
const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();

export function readFlag(key: string, fallback: boolean) {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored === "on";
  } catch {
    /* storage unavailable */
  }
  return memory.get(key) ?? fallback;
}

export function writeFlag(key: string, value: boolean) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value ? "on" : "off");
  } catch {
    /* storage unavailable: the memory value still applies for this page */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener); // keep other tabs in sync
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** [value, setValue] for a per-browser on/off preference. */
export function usePersistentFlag(key: string, fallback: boolean) {
  const value = useSyncExternalStore(
    subscribe,
    () => readFlag(key, fallback),
    () => fallback,
  );
  const set = useCallback((next: boolean) => writeFlag(key, next), [key]);
  return [value, set] as const;
}
