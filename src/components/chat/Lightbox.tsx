"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadIcon, XIcon } from "@/components/ui/icons";

const MIN = 1;
const MAX = 6;

type View = { scale: number; x: number; y: number };
const FIT: View = { scale: 1, x: 0, y: 0 };

/**
 * Full-screen image viewer with zoom: mouse wheel (towards the cursor), drag to pan,
 * double-click/tap, two-finger pinch, +/- buttons and keyboard (+, -, 0).
 */
export function Lightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<View>(FIT);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // `onBackdrop`: the press started on the dark area (not the image). Pointer capture makes the
  // later click report the stage as its target, so this is the only reliable way to tell.
  const gesture = useRef<{ dist: number; scale: number; moved: boolean; onBackdrop: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  /** Keep the image from being dragged out of view. */
  const clamp = useCallback((v: View): View => {
    const img = imgRef.current;
    if (!img || v.scale <= 1) return FIT;
    const maxX = (img.offsetWidth * (v.scale - 1)) / 2;
    const maxY = (img.offsetHeight * (v.scale - 1)) / 2;
    return { scale: v.scale, x: Math.max(-maxX, Math.min(maxX, v.x)), y: Math.max(-maxY, Math.min(maxY, v.y)) };
  }, []);

  /** Zoom to `next` keeping the point (px, py) — relative to the stage centre — fixed under the cursor. */
  const zoomAt = useCallback(
    (next: number, px = 0, py = 0) => {
      setView((v) => {
        const scale = Math.max(MIN, Math.min(MAX, next));
        const k = scale / v.scale;
        return clamp({ scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
      });
    },
    [clamp],
  );

  const relative = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { px: clientX - (r.left + r.width / 2), py: clientY - (r.top + r.height / 2) };
  };

  // Mouse wheel zoom (non-passive so the page itself doesn't scroll).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { px, py } = relative(e.clientX, e.clientY);
      zoomAt(viewRef.current.scale * Math.exp(-e.deltaY * 0.0015), px, py);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Keyboard: Esc closes, + / - zoom, 0 resets.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomAt(viewRef.current.scale * 1.25);
      else if (e.key === "-" || e.key === "_") zoomAt(viewRef.current.scale / 1.25);
      else if (e.key === "0") setView(FIT);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, zoomAt]);

  const lastPointerType = useRef("mouse");

  const onPointerDown = (e: React.PointerEvent) => {
    lastPointerType.current = e.pointerType;
    const onBackdrop = e.target === e.currentTarget;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = {
      dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      scale: viewRef.current.scale,
      moved: false,
      onBackdrop: pointers.current.size === 1 && onBackdrop,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (!g) return;

    if (pts.length === 2 && g.dist > 0) {
      // Pinch: scale by finger distance around their midpoint.
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const { px, py } = relative((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      g.moved = true;
      zoomAt(g.scale * (dist / g.dist), px, py);
    } else if (pts.length === 1 && viewRef.current.scale > 1) {
      // Drag to pan while zoomed.
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        g.moved = true;
        setDragging(true);
        setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }));
      }
    }
  };

  // Phones don't reliably send dblclick here (we handle touch ourselves), so detect double-tap.
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setDragging(false);
    if (e.pointerType !== "touch" || gesture.current?.moved || gesture.current?.onBackdrop) return;
    const now = Date.now();
    const prev = lastTap.current;
    if (prev && now - prev.t < 300 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
      lastTap.current = null;
      if (viewRef.current.scale > 1) setView(FIT);
      else {
        const { px, py } = relative(e.clientX, e.clientY);
        zoomAt(2.5, px, py);
      }
    } else {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // Touch double-taps are handled in onPointerUp; some phones also send dblclick, which would undo it.
    if (lastPointerType.current === "touch") return;
    if (viewRef.current.scale > 1) return setView(FIT);
    const { px, py } = relative(e.clientX, e.clientY);
    zoomAt(2.5, px, py);
  };

  /** Clicking the dark area closes the viewer — but not after a drag/pinch or while zoomed. */
  const onStageClick = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.moved || viewRef.current.scale > 1) return;
    if (g.onBackdrop) onClose();
  };

  const zoomed = view.scale > 1.01;
  const btn = "grid size-11 place-items-center rounded-full text-lg font-semibold hover:bg-white/10 disabled:opacity-40";

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-neutral-950" role="dialog" aria-modal="true" aria-label={name}>
      <div className="relative z-10 flex items-center gap-1 bg-neutral-950 p-3 text-white">
        <p className="min-w-0 flex-1 truncate text-sm">{name}</p>
        <button type="button" onClick={() => zoomAt(view.scale / 1.5)} disabled={!zoomed} className={btn} aria-label="Zoom out">
          −
        </button>
        <button
          type="button"
          onClick={() => setView(FIT)}
          disabled={!zoomed}
          className="min-h-11 min-w-14 rounded-full px-2 text-xs font-semibold tabular-nums hover:bg-white/10 disabled:opacity-60"
          aria-label="Reset zoom"
          title="Reset zoom"
        >
          {Math.round(view.scale * 100)}%
        </button>
        <button type="button" onClick={() => zoomAt(view.scale * 1.5)} disabled={view.scale >= MAX} className={btn} aria-label="Zoom in">
          +
        </button>
        <a href={`${src}?download=1`} download={name} className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="Download image">
          <DownloadIcon className="size-5" />
        </a>
        <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="Close preview">
          <XIcon className="size-6" />
        </button>
      </div>
      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onClick={onStageClick}
        className={`relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] select-none ${
          zoomed ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-protected, user-uploaded file */}
        <img
          ref={imgRef}
          src={src}
          alt={name}
          draggable={false}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: dragging ? "none" : "transform 120ms ease-out",
          }}
          className="max-h-full max-w-full rounded-lg object-contain will-change-transform"
        />
        {!zoomed && (
          <p className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80 sm:block">
            Scroll to zoom · double-click to zoom in
          </p>
        )}
      </div>
    </div>
  );
}
