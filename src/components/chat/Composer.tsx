"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { ACCEPT_ATTR, categoryOf, formatBytes } from "@/lib/client/format";
import { FileIcon, MicIcon, PaperclipIcon, ReplyIcon, SendIcon, SmileIcon, TrashIcon, XIcon } from "@/components/ui/icons";
import { useVoiceRecorder } from "./useVoiceRecorder";
import type { AudioMeta } from "@/lib/client/audioAnalysis";
import { Spinner } from "@/components/ui/Spinner";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[380px] w-[320px] max-w-[calc(100vw-2rem)] place-items-center rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200">
      <Spinner className="size-6 text-indigo-600" />
    </div>
  ),
});

export type UploadLimits = { image: number; video: number; audio: number; document: number };

interface ComposerProps {
  disabled?: boolean;
  replyTo: ChatMessage | null;
  limits: UploadLimits;
  onCancelReply: () => void;
  onSendText: (content: string) => void;
  /** Called on every keystroke in the message box (drives the "typing…" hint). */
  onTyping?: () => void;
  onSendFile: (file: File, caption: string, audioMeta?: AudioMeta) => void;
  onError: (message: string) => void;
}

function replyLabel(m: ChatMessage) {
  if (m.content) return m.content;
  if (m.type === "audio") return "🎤 Voice message";
  if (m.file) return `${m.type === "image" ? "Photo" : m.type === "video" ? "Video" : "Document"}: ${m.file.name}`;
  return "Message";
}

export function Composer({
  disabled,
  replyTo,
  limits,
  onCancelReply,
  onSendText,
  onTyping,
  onSendFile,
  onError,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  // Release the image preview's object URL when it changes or unmounts.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  // Close emoji picker on outside click.
  useEffect(() => {
    if (!showEmoji) return;
    const onDown = (e: PointerEvent) => {
      if (!emojiRef.current?.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [showEmoji]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    const category = categoryOf(f.name);
    if (!category) return onError("This file type isn't supported. Send images, videos, or common documents.");
    if (f.size > limits[category]) {
      return onError(`This file is too large. The maximum ${category} size is ${formatBytes(limits[category])}.`);
    }
    if (f.size === 0) return onError("This file is empty.");
    setFile(f);
    setPreview(category === "image" ? URL.createObjectURL(f) : null);
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) return setText((t) => t + emoji);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const submit = () => {
    if (disabled) return;
    const content = text.trim();
    if (file) {
      onSendFile(file, content);
      setFile(null);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else if (content) {
      onSendText(content);
    } else {
      return;
    }
    setText("");
    setShowEmoji(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !coarse) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = !disabled && (file !== null || text.trim().length > 0);

  // Voice notes: the mic takes the send button's place while there's nothing to send.
  const voice = useVoiceRecorder({
    onComplete: (recorded, meta) => onSendFile(recorded, "", meta),
    onError,
  });
  const showMic = voice.supported && !disabled && !file && text.trim().length === 0;
  const fmt = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  if (voice.state === "recording") {
    return (
      <div className="border-t border-neutral-200 bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
        {replyTo && (
          <p className="mb-2 truncate rounded-xl bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
            Replying to {replyTo.senderName}
          </p>
        )}
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <button
            type="button"
            onClick={voice.cancel}
            className="grid size-11 shrink-0 place-items-center rounded-full text-neutral-500 transition hover:bg-red-50 hover:text-red-600"
            aria-label="Cancel recording"
            title="Cancel"
          >
            <TrashIcon className="size-5" />
          </button>
          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-red-50 px-4">
            <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span className="text-sm font-medium text-red-700 tabular-nums">{fmt(voice.elapsed)}</span>
            <span className="truncate text-sm text-red-600/80">Recording… max {fmt(voice.maxSeconds)}</span>
          </div>
          <button
            type="button"
            onClick={voice.send}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-500"
            aria-label="Send voice message"
            title="Send"
          >
            <SendIcon className="size-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-neutral-200 bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-indigo-50 py-1.5 pr-1 pl-3">
          <ReplyIcon className="size-4 shrink-0 text-indigo-600" />
          <div className="min-w-0 flex-1 text-xs">
            <span className="font-semibold text-indigo-700">Replying to {replyTo.senderName}</span>
            <p className="truncate text-neutral-600">&ldquo;{replyLabel(replyTo)}&rdquo;</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="grid size-9 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-indigo-100"
            aria-label="Cancel reply"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      {file && (
        <div className="mb-2 flex items-center gap-3 rounded-xl bg-neutral-100 p-2">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white">
              <FileIcon className="size-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900">{file.name}</p>
            <p className="text-xs text-neutral-500">
              {formatBytes(file.size)} · add a caption or press send
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setPreview(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="grid size-9 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-200"
            aria-label="Remove attachment"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <div ref={emojiRef} className="relative">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowEmoji((v) => !v)}
            className={`grid size-11 place-items-center rounded-full transition disabled:opacity-50 ${
              showEmoji ? "bg-indigo-50 text-indigo-600" : "text-neutral-500 hover:bg-neutral-100"
            }`}
            aria-label="Insert emoji"
            aria-expanded={showEmoji}
          >
            <SmileIcon className="size-6" />
          </button>
          {showEmoji && (
            <div className="absolute bottom-full left-0 z-30 mb-2">
              <EmojiPicker
                onEmojiClick={(data) => insertEmoji(data.emoji)}
                lazyLoadEmojis
                width={320}
                height={380}
                previewConfig={{ showPreview: false }}
                searchPlaceholder="Search emoji"
              />
            </div>
          )}
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="grid size-11 shrink-0 place-items-center rounded-full text-neutral-500 transition hover:bg-neutral-100 disabled:opacity-50"
          aria-label="Attach a file"
        >
          <PaperclipIcon className="size-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) onTyping?.();
          }}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const pasted = e.clipboardData.files?.[0];
            if (pasted) {
              e.preventDefault();
              pickFile(pasted);
            }
          }}
          disabled={disabled}
          rows={1}
          maxLength={4000}
          placeholder={disabled ? "You can't send messages in this room" : file ? "Add a caption…" : "Type a message…"}
          className="scrollbar-thin max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border-0 bg-neutral-100 px-4 py-2.5 text-base leading-6 text-neutral-950 placeholder:text-neutral-400 focus:bg-white focus:ring-2 focus:ring-indigo-600 focus:outline-none disabled:opacity-60 sm:text-[15px]"
          aria-label="Message"
        />

        {showMic ? (
          <button
            type="button"
            onClick={() => void voice.start()}
            disabled={voice.state === "starting"}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-60"
            aria-label="Record voice message"
            title="Record voice message"
          >
            <MicIcon className="size-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-500 disabled:bg-neutral-200 disabled:text-neutral-400"
            aria-label="Send message"
          >
            <SendIcon className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}
