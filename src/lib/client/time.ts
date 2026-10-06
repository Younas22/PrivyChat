/** Time formatting for a chosen IANA time zone, always in 12-hour AM/PM. */

export function detectedTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "11:55 PM" */
export function formatTime(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone });
}

/** Calendar day (YYYY-MM-DD) of a moment in the given zone. */
function dayKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** "Today", "Yesterday", or e.g. "Tue, Oct 6" (year added when it isn't this year). */
export function formatDay(iso: string, timeZone: string) {
  const date = new Date(iso);
  const now = new Date();
  const key = dayKey(date, timeZone);
  if (key === dayKey(now, timeZone)) return "Today";
  if (key === dayKey(new Date(now.getTime() - 86_400_000), timeZone)) return "Yesterday";
  const sameYear = key.slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone,
  });
}

/** "Oct 6, 2026" */
export function formatDate(iso: string, timeZone: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone });
}

/** Current UTC offset of a zone, e.g. "GMT+5". */
export function zoneOffset(timeZone: string) {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

const FALLBACK_ZONES = [
  "UTC",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

/** Every IANA time zone the browser knows (sorted), or a short fallback list. */
export function listTimeZones(): string[] {
  try {
    const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (zones?.length) return zones.includes("UTC") ? zones : ["UTC", ...zones];
  } catch {
    /* older browser */
  }
  return FALLBACK_ZONES;
}
