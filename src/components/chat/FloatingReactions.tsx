"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

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
