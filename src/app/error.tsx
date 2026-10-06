"use client";

import Link from "next/link";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-bold text-neutral-950">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-neutral-600">
        We couldn&apos;t load this page. This may be a network or database problem — please try again.
      </p>
      <div className="mt-6 flex gap-2">
        <button onClick={reset} className="min-h-11 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-500">
          Try again
        </button>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-200">
          Home
        </Link>
      </div>
    </div>
  );
}
