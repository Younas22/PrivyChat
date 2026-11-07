"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

const MARGIN = 8;
const MOVE_THRESHOLD = 4; // px before a press becomes a drag (so taps still work)

type Pos = { x: number; y: number };

function clamp(pos: Pos, el: HTMLElement | null): Pos {
  const w = el?.offsetWidth ?? 0;
  const h = el?.offsetHeight ?? 0;
  return {
    x: Math.min(Math.max(MARGIN, pos.x), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
    y: Math.min(Math.max(MARGIN, pos.y), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
  };
}

/**
 * Lets a fixed-position floating window be dragged anywhere on screen (mouse or touch).
 * Presses on buttons, inputs and links are left alone. Until it's first moved, the window keeps
 * its CSS position; while `enabled` is false (e.g. full screen) the stored position is ignored.
 */
export function useDraggable<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moving: boolean } | null>(null);

  // Keep the window on screen when the viewport changes (rotation, keyboard, resize).
  useEffect(() => {
    if (!enabled || !pos) return;
    const onResize = () => setPos((p) => (p ? clamp(p, ref.current) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enabled, pos]);

  const onPointerDown = (e: PointerEvent<T>) => {
    if (!enabled || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, a, label, [data-no-drag]")) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, sx: e.clientX, sy: e.clientY, moving: false };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<T>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moving && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < MOVE_THRESHOLD) return;
    d.moving = true;
    setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }, ref.current));
  };

  const end = (e: PointerEvent<T>) => {
    if (!drag.current) return;
    drag.current = null;
    ref.current?.releasePointerCapture?.(e.pointerId);
  };

  const style: CSSProperties | undefined =
    enabled && pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined;

  return {
    ref,
    style,
    handlers: enabled
      ? { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end }
      : ({} as Record<string, never>),
    /** Add to the window's className while enabled: no page scroll while dragging on touch. */
    dragClass: enabled ? "touch-none cursor-grab active:cursor-grabbing select-none" : "",
  };
}
