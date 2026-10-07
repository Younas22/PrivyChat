"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import {
  adminLoginAction,
  deleteRoomAction,
  deleteUserAction,
  setRoomsLockedAction,
  type AdminFormState,
} from "@/app/admin/actions";
import type { AdminUserRow } from "@/lib/server/admin";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { AlertIcon, LockIcon, SearchIcon, TrashIcon } from "@/components/ui/icons";

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(adminLoginAction, undefined);
  const input =
    "block min-h-12 w-full rounded-xl border-0 px-4 text-base text-neutral-950 ring-1 ring-inset ring-neutral-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none";
  return (
    <form action={formAction} className="space-y-3">
      <label htmlFor="admin-email" className="block text-sm font-medium text-neutral-700">
        Email
      </label>
      <input id="admin-email" name="email" type="email" required autoComplete="username" className={input} />
      <label htmlFor="admin-password" className="block text-sm font-medium text-neutral-700">
        Password
      </label>
      <input id="admin-password" name="password" type="password" required autoComplete="current-password" className={input} />
      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Sign in
      </Button>
    </form>
  );
}

/** Lock/unlock My Rooms for one person. */
export function LockToggle({ userId, locked }: { userId: string; locked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setRoomsLockedAction(userId, !locked))}
      aria-pressed={locked}
      title={locked ? "My Rooms asks for their code. Click to unlock." : "Make My Rooms ask for their code"}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition disabled:opacity-60 ${
        locked ? "bg-neutral-950 text-white hover:bg-neutral-800" : "text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
      }`}
    >
      <LockIcon className="size-3.5" />
      {locked ? "Private" : "Make private"}
    </button>
  );
}

export function DeleteUserButton({ userId, name }: { userId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(`Delete ${name}? Their rooms, messages and files will be permanently deleted.`)) {
          start(() => deleteUserAction(userId));
        }
      }}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-60"
    >
      <TrashIcon className="size-3.5" />
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

export function DeleteRoomButton({ roomCode, name, backTo }: { roomCode: string; name: string; backTo: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(`Delete the room "${name}" with all its messages and files?`)) {
          start(() => deleteRoomAction(roomCode, backTo));
        }
      }}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 disabled:opacity-60"
    >
      <TrashIcon className="size-3.5" />
      {pending ? "Deleting…" : "Delete room"}
    </button>
  );
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

/** Searchable list of every user with their actions. */
export function UsersTable({ users }: { users: AdminUserRow[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? users.filter((u) => u.displayName.toLowerCase().includes(term)) : users;
  }, [users, q]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-xl px-3 ring-1 ring-neutral-200 focus-within:ring-2 focus-within:ring-indigo-600">
        <SearchIcon className="size-4 shrink-0 text-neutral-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search users by name"
          aria-label="Search users"
          className="min-h-11 w-full bg-transparent text-sm focus:outline-none"
        />
        <span className="shrink-0 text-xs text-neutral-400">
          {shown.length} of {users.length}
        </span>
      </div>
      <ul className="divide-y divide-neutral-100 rounded-2xl ring-1 ring-neutral-200">
        {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-500">No users found.</li>}
        {shown.map((u) => (
          <li key={u.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <Link href={`/admin/users/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
              <Avatar name={u.displayName} id={u.id} size="md" />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-neutral-950">{u.displayName}</span>
                  {u.invited && (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      Invited
                    </span>
                  )}
                </span>
                <span className="block text-xs text-neutral-500">
                  {u.ownedRooms} owned · {u.joinedRooms} joined · {u.messages} messages · active {shortDate(u.lastActiveAt)} ·
                  joined {shortDate(u.createdAt)}
                </span>
              </span>
            </Link>
            <span className="flex shrink-0 flex-wrap gap-2">
              <Link
                href={`/admin/users/${u.id}`}
                className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-xs font-semibold text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-50"
              >
                Rooms
              </Link>
              <LockToggle userId={u.id} locked={u.roomsLocked} />
              <DeleteUserButton userId={u.id} name={u.displayName} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
