"use client";

import { useEffect } from "react";
import { DownloadIcon, XIcon } from "@/components/ui/icons";

export function Lightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-neutral-950/95"
      role="dialog"
      aria-modal="true"
      aria-label={name}
      onClick={onClose}
    >
      <div className="flex items-center gap-2 p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 truncate text-sm">{name}</p>
        <a
          href={`${src}?download=1`}
          download={name}
          className="grid size-11 place-items-center rounded-full hover:bg-white/10"
          aria-label="Download image"
        >
          <DownloadIcon className="size-5" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full hover:bg-white/10"
          aria-label="Close preview"
        >
          <XIcon className="size-6" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-protected, user-uploaded file */}
        <img
          src={src}
          alt={name}
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
