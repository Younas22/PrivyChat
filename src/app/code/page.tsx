import type { Metadata } from "next";
import Link from "next/link";
import { CodeForm } from "@/components/code/CodeForm";
import { Logo } from "@/components/ui/Logo";
import { KeyIcon } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Use your access code · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default async function CodePage({ searchParams }: PageProps<"/code">) {
  const nextParam = (await searchParams).next;
  const next = typeof nextParam === "string" && /^\/chat\/[A-Za-z0-9]{6,32}$/.test(nextParam) ? nextParam : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-950">
      <header className="px-4 py-4 sm:px-6">
        <Logo dark />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-indigo-600 text-white">
            <KeyIcon className="size-6" />
          </div>
          <h1 className="text-xl font-bold text-neutral-950 sm:text-2xl">Open your chats here</h1>
          <p className="mt-1 mb-6 text-sm leading-relaxed text-neutral-500">
            Enter the access code shown in your chat&apos;s side panel (or on My Rooms) on the device you used before.
            This browser will then open your rooms and room links.
          </p>
          <CodeForm next={next} />
          <p className="mt-5 text-center text-xs text-neutral-400">
            No code? <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500">Start a new room</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
