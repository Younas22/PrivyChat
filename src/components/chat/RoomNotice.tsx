import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/Logo";
import { AlertIcon, ArchiveIcon, UserMinusIcon, UsersIcon } from "@/components/ui/icons";

export type NoticeKind = "closed" | "full" | "not_found" | "removed" | "deleted";

const NOTICES: Record<NoticeKind, { title: string; text: string; icon: ReactNode }> = {
  closed: {
    title: "This chat room has been closed.",
    text: "The owner saved and closed this room, so it can no longer be opened or joined.",
    icon: <ArchiveIcon className="size-7" />,
  },
  full: {
    title: "This chat room is full.",
    text: "Each room has space for two people. Ask your friend to create a new room for you.",
    icon: <UsersIcon className="size-7" />,
  },
  not_found: {
    title: "Chat room not found.",
    text: "This link is invalid or the room no longer exists. Double-check the link or start a new room.",
    icon: <AlertIcon className="size-7" />,
  },
  removed: {
    title: "You're no longer in this room.",
    text: "You left this chat or the owner removed you, so you can no longer read or send messages here.",
    icon: <UserMinusIcon className="size-7" />,
  },
  deleted: {
    title: "This chat room was deleted.",
    text: "The owner permanently deleted this room and all of its messages.",
    icon: <AlertIcon className="size-7" />,
  },
};

/** `codeNext`: a room link to return to after entering an access code (shown for a full room). */
export function RoomNotice({ kind, codeNext }: { kind: NoticeKind; codeNext?: string }) {
  const n = NOTICES[kind];
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="px-4 py-4 sm:px-6">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-neutral-950 text-white">
            {n.icon}
          </div>
          <h1 className="text-xl font-bold text-neutral-950 sm:text-2xl">{n.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600 sm:text-base">{n.text}</p>
          <Link
            href="/"
            className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Create a new room
          </Link>
          {codeNext && (
            <p className="mt-6 text-sm text-neutral-500">
              Already in this room on another device?{" "}
              <Link href={`/code?next=${encodeURIComponent(codeNext)}`} className="font-semibold text-indigo-600 hover:text-indigo-500">
                Use your access code
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
