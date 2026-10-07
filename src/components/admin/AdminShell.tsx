import Link from "next/link";
import type { ReactNode } from "react";
import { adminLogoutAction } from "@/app/admin/actions";
import { Logo } from "@/components/ui/Logo";

/** Header + container for admin pages. */
export function AdminShell({
  title,
  back,
  children,
}: {
  title: string;
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="bg-neutral-950">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="flex items-center gap-3">
            <Logo dark href="/admin" />
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">Admin</span>
          </span>
          <form action={adminLogoutAction}>
            <button
              type="submit"
              className="min-h-9 rounded-lg px-3 text-sm font-semibold text-neutral-300 ring-1 ring-white/15 hover:bg-white/10"
            >
              Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        {back && (
          <Link href={back.href} className="mb-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">
            ← {back.label}
          </Link>
        )}
        <h1 className="mb-5 text-2xl font-bold text-neutral-950">{title}</h1>
        {children}
      </main>
    </div>
  );
}
