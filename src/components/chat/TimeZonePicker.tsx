"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CheckIcon, ChevronDownIcon, ClockIcon, SearchIcon } from "@/components/ui/icons";
import { formatTime, listTimeZones, zoneOffset } from "@/lib/client/time";

interface ZoneOption {
  value: string;
  title: string; // "Karachi"
  region: string; // "Asia"
  offset: string; // "GMT+5"
  search: string; // lower-cased text to match against
}

const noopSubscribe = () => () => {};

/** "America/Argentina/Buenos_Aires" → { title: "Buenos Aires", region: "America · Argentina" } */
function prettyZone(zone: string) {
  const parts = zone.split("/").map((p) => p.replace(/_/g, " "));
  return { title: parts.at(-1) ?? zone, region: parts.slice(0, -1).join(" · ") };
}

// ~400 zones with offsets: build once per page.
let zonesCache: ZoneOption[] | null = null;
function allZones(): ZoneOption[] {
  return (zonesCache ??= listTimeZones().map((value) => {
    const { title, region } = prettyZone(value);
    const offset = zoneOffset(value);
    const plainOffset = offset.replace("GMT", "").trim(); // "+5", "-3:30"
    return { value, title, region, offset, search: `${value} ${title} ${region} ${offset} ${plainOffset}`.toLowerCase() };
  }));
}

interface TimeZonePickerProps {
  /** "auto" or an IANA zone. */
  preference: string;
  detected: string;
  onChange: (zone: string) => void;
}

/** Searchable time zone picker styled for the dark side panel (works with mouse, keyboard and touch). */
export function TimeZonePicker({ preference, detected, onChange }: TimeZonePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  // Zone data differs between server and browser, so only build it after hydration.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const options = useMemo<ZoneOption[]>(() => {
    if (!hydrated) return [];
    const d = prettyZone(detected);
    const auto: ZoneOption = {
      value: "auto",
      title: "Automatic",
      region: `${d.title}${d.region ? `, ${d.region}` : ""} (this device)`,
      offset: zoneOffset(detected),
      search: `automatic auto device ${detected} ${d.title}`.toLowerCase(),
    };
    return [auto, ...allZones()];
  }, [hydrated, detected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/_/g, " ");
    if (!q) return options;
    return options.filter((o) => q.split(/\s+/).every((word) => o.search.includes(word)));
  }, [options, query]);

  const selectedZone = preference === "auto" ? detected : preference;
  const selected = prettyZone(selectedZone);

  const openPicker = () => {
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === preference)));
    setOpen(true);
  };

  const choose = (value: string) => {
    setOpen(false);
    if (value !== preference) onChange(value);
  };

  // Close on outside tap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[active];
      if (pick) choose(pick.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef}>
      <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Time zone</p>

      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-left ring-1 ring-white/10 transition hover:bg-white/10"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-500/20 text-indigo-300">
          <ClockIcon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">
            {preference === "auto" ? "Automatic" : selected.title}
            {hydrated && (
              <span className="font-normal text-neutral-400"> · {formatTime(new Date().toISOString(), selectedZone)}</span>
            )}
          </span>
          <span className="block truncate text-xs text-neutral-500">
            {preference === "auto" ? `${selected.title} (this device)` : selected.region || "UTC"}
            {hydrated && ` · ${zoneOffset(selectedZone)}`}
          </span>
        </span>
        <ChevronDownIcon className={`size-4 shrink-0 text-neutral-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="animate-fade-in mt-2 overflow-hidden rounded-xl bg-neutral-900 shadow-xl ring-1 ring-white/10">
          <div className="flex items-center gap-2 border-b border-white/10 px-3">
            <SearchIcon className="size-4 shrink-0 text-neutral-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search city or offset…"
              aria-label="Search time zones"
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              className="min-h-11 w-full bg-transparent text-sm text-white placeholder:text-neutral-500 focus:outline-none"
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label="Time zones" className="scrollbar-thin max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-3 text-sm text-neutral-500">No matching time zone</li>}
            {filtered.map((o, i) => {
              const isSelected = o.value === preference;
              return (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  data-index={i}
                  data-value={o.value}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? "bg-white/10" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${isSelected ? "font-semibold text-indigo-300" : "text-white"}`}>
                      {o.title}
                    </span>
                    {o.region && <span className="block truncate text-xs text-neutral-500">{o.region}</span>}
                  </span>
                  <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-neutral-400">
                    {o.offset}
                  </span>
                  <span className="w-4 shrink-0">{isSelected && <CheckIcon className="size-4 text-indigo-300" />}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">Message times are shown in this zone, in AM/PM.</p>
    </div>
  );
}
