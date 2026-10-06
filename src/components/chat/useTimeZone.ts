"use client";

import { useSyncExternalStore } from "react";
import { usePersistentValue } from "@/lib/client/usePersistentFlag";
import { detectedTimeZone, isValidTimeZone } from "@/lib/client/time";

const noopSubscribe = () => () => {};

/**
 * The viewer's chosen time zone ("auto" = this device's zone), kept in their browser.
 * Server render and hydration use UTC so the HTML matches; the real zone applies right after.
 */
export function useTimeZone() {
  const [preference, setPreference] = usePersistentValue("talkroom:tz", "auto");
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const detected = hydrated ? detectedTimeZone() : "UTC";
  const timeZone = !hydrated
    ? "UTC"
    : preference !== "auto" && isValidTimeZone(preference)
      ? preference
      : detected;
  return { timeZone, preference, detected, setPreference };
}
