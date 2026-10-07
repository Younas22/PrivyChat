import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { DeleteRoomButton, DeleteUserButton, LockToggle } from "@/components/admin/AdminClient";
import { APP_NAME } from "@/lib/brand";
import { getUserWithRooms, requireAdmin } from "@/lib/server/admin";

export const metadata: Metadata = { title: `Admin · ${APP_NAME}`, robots: { index: false, follow: false } };

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[userId]">) {
  await requireAdmin();
  const { userId } = await params;
  const data = await getUserWithRooms(userId);
  if (!data) notFound();
  const { user, rooms } = data;
  const back = `/admin/users/${user.id}`;

  return (
    <AdminShell title={user.displayName} back={{ href: "/admin", label: "All users" }}>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <LockToggle userId={user.id} locked={user.roomsLocked} />
        <DeleteUserButton userId={user.id} name={user.displayName} />
        {user.invited && <span className="text-xs text-amber-700">Invited · hasn&apos;t used their code yet</span>}
      </div>
      <h2 className="mb-2 text-xs font-semibold tracking-wider text-neutral-500 uppercase">Rooms ({rooms.length})</h2>
      <ul className="divide-y divide-neutral-100 rounded-2xl ring-1 ring-neutral-200">
        {rooms.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-500">No rooms.</li>}
        {rooms.map((r) => (
          <li key={r.roomCode} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="truncate font-semibold text-neutral-950">{r.name}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    r.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {r.status === "open" ? "Open" : "Saved"}
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-neutral-400">{r.isOwner ? "Owner" : "Member"}</span>
              </p>
              <p className="text-xs text-neutral-500">
                {r.members.join(" & ") || "No members"} · {r.messages} messages
              </p>
            </div>
            <span className="flex shrink-0 gap-2">
              <Link
                href={`/admin/rooms/${r.roomCode}`}
                className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-xs font-semibold text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-50"
              >
                Read chat
              </Link>
              <DeleteRoomButton roomCode={r.roomCode} name={r.name} backTo={back} />
            </span>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
