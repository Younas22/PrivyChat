"use client";

import { useActionState, useState } from "react";
import { createRoomAction, type FormState } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { AlertIcon } from "@/components/ui/icons";

export function CreateRoomForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createRoomAction, undefined);
  const [showRoomName, setShowRoomName] = useState(false);

  return (
    <form action={formAction} className="w-full space-y-3">
      <div>
        <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-neutral-700">
          Your name
        </label>
        <input
          id="displayName"
          name="displayName"
          required
          maxLength={40}
          autoComplete="nickname"
          placeholder="e.g. Younas"
          className="block min-h-12 w-full rounded-xl border-0 bg-white px-4 text-base text-neutral-950 ring-1 ring-inset ring-neutral-300 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
        />
      </div>

      {showRoomName ? (
        <div>
          <label htmlFor="roomName" className="mb-1.5 block text-sm font-medium text-neutral-700">
            Room name <span className="font-normal text-neutral-400">(optional)</span>
          </label>
          <input
            id="roomName"
            name="roomName"
            maxLength={80}
            placeholder="e.g. Weekend Plan"
            className="block min-h-12 w-full rounded-xl border-0 bg-white px-4 text-base text-neutral-950 ring-1 ring-inset ring-neutral-300 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowRoomName(true)}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          + Add a room name
        </button>
      )}

      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? "Creating room…" : "Create Chat Room"}
      </Button>
    </form>
  );
}
