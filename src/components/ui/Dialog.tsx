"use client";

import { useEffect, useId, type ReactNode } from "react";
import { XIcon } from "./icons";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Prevent closing (e.g. while an action is running). */
  locked?: boolean;
}

/** Accessible modal: centered on desktop, bottom sheet on mobile. */
export function Dialog({ open, onClose, title, children, locked }: DialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, locked, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div
        className="animate-fade-in absolute inset-0 bg-neutral-950/50 backdrop-blur-[2px]"
        onClick={() => !locked && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-slide-up relative w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-neutral-950">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            className="-m-2 grid size-10 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 disabled:opacity-50"
            aria-label="Close"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
