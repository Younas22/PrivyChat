import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { AccessCodeCard } from "@/components/code/AccessCodeCard";
import { ArchiveIcon, KeyIcon, MessageIcon } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/brand";
import { getAccessCode, getCurrentUser } from "@/lib/server/identity";
import { listMyRooms } from "@/lib/server/rooms";
import type { RoomSummary } from "@/lib/types";

export const metadata: Metadata = {
  title: `My Rooms · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

function RoomRow({ room }: { room: RoomSummary }) {
  const saved = room.status === "closed";
  const withWhom = room.memberNames.length ? `with ${room.memberNames.join(", ")}` : "Waiting for a friend";
  return (
    <li>
      <Link
        href={`/chat/${room.roomCode}`}
        className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-neutral-50 sm:px-4"
      >
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-xl ${
            saved ? "bg-neutral-950 text-white" : "bg-indigo-600 text-white"
          }`}
        >
          {saved ? <ArchiveIcon className="size-5" /> : <MessageIcon className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-neutral-950">{room.name}</p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                saved ? "bg-neutral-100 text-neutral-600" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {saved ? "Saved" : "Open"}
            </span>
            {!room.isOwner && (
              <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                Member
              </span>
            )}
          </div>
          <p className="truncate text-sm text-neutral-500">{room.lastMessage ?? "No messages yet"}</p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {withWhom} · {room.messageCount} {room.messageCount === 1 ? "message" : "messages"} ·{" "}
            {saved && room.closedAt ? `Saved ${formatDate(room.closedAt)}` : `Created ${formatDate(room.createdAt)}`}
          </p>
        </div>
      </Link>
    </li>
  );
}

function Section({ title, rooms }: { title: string; rooms: RoomSummary[] }) {
  if (!rooms.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-2 px-3 text-xs font-semibold tracking-wider text-neutral-500 uppercase sm:px-4">
        {title} <span className="text-neutral-400">({rooms.length})</span>
      </h2>
      <ul className="divide-y divide-neutral-100">
        {rooms.map((r) => (
          <RoomRow key={r.roomCode} room={r} />
        ))}
      </ul>
    </section>
  );
}

export default async function MyRoomsPage() {
  const [rooms, user] = await Promise.all([listMyRooms(), getCurrentUser()]);
  const accessCode = user ? await getAccessCode(user) : null;
  const open = rooms.filter((r) => r.status === "open");
  const saved = rooms.filter((r) => r.status === "closed");

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <Link
          href="/"
          className="inline-flex min-h-10 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          New Room
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-1 pb-16 sm:px-3">
        <div className="px-3 pt-4 sm:px-4">
          <h1 className="text-2xl font-bold text-neutral-950 sm:text-3xl">My Rooms</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Rooms you created or joined. Saved rooms are read-only and only shown to their owner.
          </p>
        </div>

        {accessCode && (
          <div className="mx-3 mt-6 max-w-md sm:mx-4">
            <AccessCodeCard code={accessCode} tone="light" />
          </div>
        )}

        {rooms.length === 0 ? (
          <div className="mx-3 mt-10 flex flex-col items-center rounded-3xl bg-neutral-50 px-6 py-14 text-center sm:mx-4">
            <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
              <MessageIcon className="size-7" />
            </span>
            <h2 className="font-semibold text-neutral-900">No rooms yet</h2>
            <p className="mt-1 max-w-xs text-sm text-neutral-500">
              Rooms you create or join will show up here. Used another browser before? Enter your access code.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link
                href="/code"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white hover:bg-neutral-800"
              >
                <KeyIcon className="size-4" /> Use code
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-11 items-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Create a room
              </Link>
            </div>
          </div>
        ) : (
          <>
            <Section title="Open rooms" rooms={open} />
            <Section title="Saved rooms" rooms={saved} />
          </>
        )}
      </main>
    </div>
  );
}
