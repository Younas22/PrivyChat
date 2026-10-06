"use client";

import { useCallback, useSyncExternalStore } from "react";

// Per-browser preferences kept in localStorage, with an in-memory fallback when storage is
// blocked. Server render uses the default; the stored value applies after hydration.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export function readValue(key: string, fallback: string) {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    /* storage unavailable */
  }
  return memory.get(key) ?? fallback;
}

export function writeValue(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
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

/** [value, setValue] for a per-browser string preference. */
export function usePersistentValue(key: string, fallback: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => readValue(key, fallback),
    () => fallback,
  );
  const set = useCallback((next: string) => writeValue(key, next), [key]);
  return [value, set] as const;
}

// ---- on/off flags (stored as "on" / "off") ----

export function readFlag(key: string, fallback: boolean) {
  return readValue(key, fallback ? "on" : "off") === "on";
}

export function writeFlag(key: string, value: boolean) {
  writeValue(key, value ? "on" : "off");
}

/** [value, setValue] for a per-browser on/off preference. */
export function usePersistentFlag(key: string, fallback: boolean) {
  const [raw, setRaw] = usePersistentValue(key, fallback ? "on" : "off");
  const set = useCallback((next: boolean) => setRaw(next ? "on" : "off"), [setRaw]);
  return [raw === "on", set] as const;
}
