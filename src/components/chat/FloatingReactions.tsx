"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { LIVE_REACTIONS } from "@/lib/types";

const REACT_GAP_MS = 250; // keeps rapid taps under the server's rate limit

/** Row of emoji buttons for live video (both the recorder and viewers). */
export function ReactionBar({
  onReact,
  large,
  label,
}: {
  onReact: (emoji: string) => void;
  large?: boolean;
  label: string;
}) {
  const lastAt = useRef(-Infinity);
  return (
    <div
      data-no-drag
      className={`scrollbar-dark flex max-w-full gap-0.5 overflow-x-auto px-1.5 py-1.5 ${large ? "justify-center" : ""}`}
      role="group"
      aria-label={label}
    >
      {LIVE_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={(e) => {
            if (e.timeStamp - lastAt.current < REACT_GAP_MS) return;
            lastAt.current = e.timeStamp;
            onReact(emoji);
          }}
          className={`grid shrink-0 place-items-center rounded-full transition hover:bg-white/15 active:scale-90 ${
            large ? "size-11 text-2xl" : "size-8 text-lg"
          }`}
          aria-label={`React ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

type Floating = { id: number; emoji: string; name?: string; left: number; sway: number };

const LIFETIME_MS = 2700;
const MAX_ON_SCREEN = 30;

/** Emojis that rise over a live video and fade out. */
export function useFloatingReactions() {
  const [items, setItems] = useState<Floating[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const add = useCallback((emoji: string, name?: string) => {
    const id = nextId.current++;
    const item: Floating = {
      id,
      emoji,
      name,
      left: 55 + Math.random() * 35, // right side, clear of the main controls
      sway: Math.round((Math.random() - 0.5) * 60),
    };
    setItems((list) => [...list.slice(-(MAX_ON_SCREEN - 1)), item]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setItems((list) => list.filter((x) => x.id !== id));
    }, LIFETIME_MS);
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return { items, add };
}

export function FloatingReactions({ items, size = "lg" }: { items: Floating[]; size?: "sm" | "lg" }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {items.map((r) => (
        <span
          key={r.id}
          className="animate-float-up absolute bottom-2 flex flex-col items-center gap-0.5"
          style={{ left: `${r.left}%`, "--sway": `${r.sway}px` } as CSSProperties}
        >
          <span className={`drop-shadow-lg ${size === "lg" ? "text-4xl" : "text-2xl"}`}>{r.emoji}</span>
          {r.name && (
            <span className="max-w-24 truncate rounded-full bg-black/55 px-1.5 text-[10px] font-medium text-white">
              {r.name}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
