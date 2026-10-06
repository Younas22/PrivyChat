"use client";

import { useActionState } from "react";
import { joinRoomAction, type FormState } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { AlertIcon, LockIcon } from "@/components/ui/icons";

interface JoinRoomFormProps {
  roomCode: string;
  roomName: string;
  ownerName: string;
  defaultName?: string;
}

export function JoinRoomForm({ roomCode, roomName, ownerName, defaultName }: JoinRoomFormProps) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(joinRoomAction, undefined);

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-950">
      <header className="px-4 py-4 sm:px-6">
        <Logo dark />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-indigo-600 text-white">
            <LockIcon className="size-6" />
          </div>
          <p className="text-sm text-neutral-500">
            <span className="font-medium text-neutral-800">{ownerName}</span> invited you to a private chat
          </p>
          <h1 className="mt-1 text-xl font-bold break-words text-neutral-950 sm:text-2xl">{roomName}</h1>

          <form action={formAction} className="mt-6 space-y-3">
            <input type="hidden" name="roomCode" value={roomCode} />
            <label htmlFor="displayName" className="block text-sm font-medium text-neutral-700">
              Your name
            </label>
            <input
              id="displayName"
              name="displayName"
              required
              maxLength={40}
              defaultValue={defaultName}
              autoComplete="nickname"
              autoFocus
              placeholder="e.g. Ali"
              className="block min-h-12 w-full rounded-xl border-0 px-4 text-base text-neutral-950 ring-1 ring-inset ring-neutral-300 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
            />
            {state?.error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertIcon className="mt-0.5 size-4 shrink-0" />
                {state.error}
              </p>
            )}
            <Button type="submit" size="lg" loading={pending} className="w-full">
              {pending ? "Joining…" : "Join Chat Room"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-neutral-400">Only two people can be in this room.</p>
        </div>
      </main>
    </div>
  );
}
