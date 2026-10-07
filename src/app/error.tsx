"use client";

import Link from "next/link";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-bold text-neutral-950">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-600">
        This page couldn&apos;t finish loading. If the site was just updated, reloading fixes it; otherwise it may be a
        network or database problem.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {/* A full reload picks up the latest version (a soft retry can't after a deploy). */}
        <button
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Reload page
        </button>
        <button
          onClick={reset}
          className="min-h-11 rounded-xl px-5 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
