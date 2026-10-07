import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminClient";
import { Logo } from "@/components/ui/Logo";
import { LockIcon } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/brand";
import { isAdmin } from "@/lib/server/admin";

export const metadata: Metadata = { title: `Admin · ${APP_NAME}`, robots: { index: false, follow: false } };

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-950">
      <header className="px-4 py-4 sm:px-6">
        <Logo dark />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-neutral-950 text-white">
            <LockIcon className="size-6" />
          </div>
          <h1 className="mb-5 text-xl font-bold text-neutral-950">Admin sign in</h1>
          <AdminLoginForm />
        </div>
      </main>
    </div>
  );
}
