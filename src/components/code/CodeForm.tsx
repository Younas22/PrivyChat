"use client";

import { useActionState } from "react";
import { accessCodeAction, type FormState } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { AlertIcon } from "@/components/ui/icons";

/** Enter an access code to open your chats in this browser. */
export function CodeForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(accessCodeAction, undefined);
  return (
    <form action={formAction} className="space-y-3">
      {next && <input type="hidden" name="next" value={next} />}
      <label htmlFor="code" className="block text-sm font-medium text-neutral-700">
        Access code
      </label>
      <input
        id="code"
        name="code"
        required
        autoFocus
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={24}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        className="block min-h-12 w-full rounded-xl border-0 px-4 font-mono text-base tracking-widest text-neutral-950 uppercase ring-1 ring-inset ring-neutral-300 placeholder:tracking-widest placeholder:text-neutral-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
      />
      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? "Opening…" : next ? "Open this chat" : "Show my rooms"}
      </Button>
    </form>
  );
}
