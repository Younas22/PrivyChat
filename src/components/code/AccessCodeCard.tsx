"use client";

import { useState, useTransition } from "react";
import { regenerateCodeAction } from "@/app/actions";
import { CopyIcon, KeyIcon, RefreshIcon } from "@/components/ui/icons";

interface AccessCodeCardProps {
  code: string;
  /** "dark" for the chat side panel, "light" for pages. */
  tone: "dark" | "light";
  onNotice?: (text: string, kind: "success" | "error") => void;
}

/** Shows the person's access code with Copy and "New code" (the old code stops working). */
export function AccessCodeCard({ code: initialCode, tone, onNotice }: AccessCodeCardProps) {
  const [code, setCode] = useState(initialCode);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dark = tone === "dark";

  const tell = (text: string, kind: "success" | "error") => {
    if (onNotice) onNotice(text, kind);
    else {
      setNotice(text);
      setTimeout(() => setNotice(null), 2500);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      tell("Access code copied", "success");
    } catch {
      tell("Couldn't copy. Select the code and copy it.", "error");
    }
  };

  const renew = () => {
    if (!window.confirm("Make a new access code? The current code will stop working on other devices.")) return;
    startTransition(async () => {
      const res = await regenerateCodeAction();
      if (res.code) {
        setCode(res.code);
        tell("New access code created", "success");
      } else {
        tell(res.error ?? "Couldn't make a new code.", "error");
      }
    });
  };

  const btn = `inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition disabled:opacity-60 ${
    dark ? "text-neutral-200 hover:bg-white/10" : "text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
  }`;

  return (
    <div>
      <p className={`mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase ${dark ? "text-neutral-500" : "text-neutral-500"}`}>
        <KeyIcon className="size-3.5" /> Your access code
      </p>
      <div className={`rounded-xl px-3 py-2.5 ${dark ? "bg-white/5 ring-1 ring-white/10" : "bg-neutral-50 ring-1 ring-neutral-200"}`}>
        <p
          className={`font-mono text-[15px] font-semibold tracking-wider select-all ${dark ? "text-white" : "text-neutral-950"}`}
          aria-label="Access code"
        >
          {code}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={copy} className={btn}>
            <CopyIcon className="size-3.5" /> Copy
          </button>
          <button type="button" onClick={renew} disabled={pending} className={btn}>
            <RefreshIcon className={`size-3.5 ${pending ? "animate-spin" : ""}`} /> New code
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">
        On another browser or phone, tap <span className="font-medium">Use code</span> on the home page to open your
        rooms there. Keep it private: anyone with this code can read your chats.
      </p>
      {notice && (
        <p role="status" className={`mt-2 text-xs font-medium ${dark ? "text-indigo-300" : "text-indigo-600"}`}>
          {notice}
        </p>
      )}
    </div>
  );
}
