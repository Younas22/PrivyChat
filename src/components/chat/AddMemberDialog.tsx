"use client";

import { useEffect, useState } from "react";
import type { Contact, RoomMemberInfo } from "@/lib/types";
import { api } from "@/lib/client/api";
import { APP_NAME } from "@/lib/brand";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { CheckIcon, CopyIcon, ShareIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";

/** The message the owner sends to the person they added. */
function inviteText(name: string, code: string) {
  return `Hi ${name}! Open ${window.location.origin}, tap "Use code" and enter: ${code}`;
}

/** Shows a member's access code with Copy / Share, and what to do with it. */
export function ShareCodePanel({
  name,
  code,
  onDone,
  onNotice,
}: {
  name: string;
  code: string;
  onDone: () => void;
  onNotice: (text: string, kind: "success" | "error") => void;
}) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after mount
    setCanShare(typeof navigator.share === "function");
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteText(name, code));
      onNotice("Code and instructions copied", "success");
    } catch {
      onNotice("Couldn't copy. Select the code and copy it.", "error");
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: APP_NAME, text: inviteText(name, code) });
    } catch {
      /* cancelled */
    }
  };

  return (
    <div>
      <p className="text-sm text-neutral-600">
        Send this code to <span className="font-semibold text-neutral-900">{name}</span>. They open {APP_NAME}, tap{" "}
        <span className="font-semibold">Use code</span> and enter it. The room then appears in their My Rooms.
      </p>
      <p
        className="mt-4 rounded-xl bg-neutral-50 px-4 py-3 text-center font-mono text-xl font-bold tracking-wider text-neutral-950 ring-1 ring-neutral-200 select-all"
        aria-label={`${name}'s access code`}
      >
        {code}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="secondary" onClick={copy} className="flex-1">
          <CopyIcon className="size-4" /> Copy
        </Button>
        {canShare && (
          <Button type="button" variant="secondary" onClick={share} className="flex-1">
            <ShareIcon className="size-4" /> Share
          </Button>
        )}
        <Button type="button" onClick={onDone} className="flex-1">
          Done
        </Button>
      </div>
      <p className="mt-3 text-xs text-neutral-400">
        Only you see this code until {name} uses it. After that it&apos;s private to them.
      </p>
    </div>
  );
}

interface AddMemberDialogProps {
  open: boolean;
  onClose: () => void;
  base: string;
  /** People already in the room (not offered again). */
  memberUserIds: string[];
  onNotice: (text: string, kind: "success" | "error") => void;
}

/** Owner adds the second member: a new person by name (gets a code) or someone they chatted with. */
export function AddMemberDialog({ open, onClose, base, memberUserIds, onNotice }: AddMemberDialogProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [result, setResult] = useState<{ name: string; code: string | null } | null>(null);

  // Load past contacts each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api<{ contacts: Contact[] }>("/api/contacts")
      .then((r) => !cancelled && setContacts(r.contacts))
      .catch(() => !cancelled && setContacts([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const close = () => {
    if (busy) return;
    setName("");
    setResult(null);
    setContacts(null);
    onClose();
  };

  const add = async (body: { displayName: string } | { userId: string }) => {
    setBusy(true);
    try {
      const res = await api<{ member: RoomMemberInfo; code: string | null }>(`${base}/members`, {
        method: "POST",
        json: body,
      });
      setResult({ name: res.member.displayName, code: res.code });
      if (!res.code) onNotice(`${res.member.displayName} was added`, "success");
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "Couldn't add this person.", "error");
    } finally {
      setBusy(false);
    }
  };

  const others = (contacts ?? []).filter((c) => !memberUserIds.includes(c.userId));

  return (
    <Dialog open={open} onClose={close} title={result ? `${result.name} was added` : "Add member"} locked={busy}>
      {result ? (
        result.code ? (
          <ShareCodePanel name={result.name} code={result.code} onDone={close} onNotice={onNotice} />
        ) : (
          <div>
            <p className="flex items-start gap-2 text-sm text-neutral-600">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              This room now appears in {result.name}&apos;s My Rooms. They can open it with the code they already use.
            </p>
            <Button type="button" onClick={close} className="mt-5 w-full">
              Done
            </Button>
          </div>
        )
      ) : (
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void add({ displayName: name.trim() });
            }}
            className="space-y-3"
          >
            <label htmlFor="new-member-name" className="block text-sm font-medium text-neutral-700">
              New person&apos;s name
            </label>
            <input
              id="new-member-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoFocus
              placeholder="e.g. Sam"
              className="block min-h-12 w-full rounded-xl border-0 px-4 text-base text-neutral-950 ring-1 ring-inset ring-neutral-300 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
            />
            <Button type="submit" loading={busy} disabled={!name.trim()} className="w-full">
              Add &amp; get their code
            </Button>
            <p className="text-xs text-neutral-500">You&apos;ll get a code to send them. Only you receive it.</p>
          </form>

          <div className="mt-6 border-t border-neutral-100 pt-4">
            <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-500 uppercase">
              Or someone you&apos;ve chatted with
            </p>
            {contacts === null ? (
              <div className="flex justify-center py-3 text-indigo-600">
                <Spinner className="size-5" />
              </div>
            ) : others.length === 0 ? (
              <p className="text-sm text-neutral-400">No past contacts yet.</p>
            ) : (
              <ul className="scrollbar-thin max-h-48 space-y-1 overflow-y-auto">
                {others.map((c) => (
                  <li key={c.userId} className="flex items-center gap-3 rounded-xl px-1 py-1">
                    <Avatar name={c.displayName} id={c.userId} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">{c.displayName}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void add({ userId: c.userId })}
                      className="min-h-9 rounded-lg px-3 text-sm font-semibold text-indigo-600 ring-1 ring-indigo-200 transition hover:bg-indigo-50 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
