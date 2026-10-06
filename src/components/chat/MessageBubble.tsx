"use client";

import { memo, useEffect, useRef, useState } from "react";
import { REACTION_EMOJIS, type ChatMessage, type ReplyPreview } from "@/lib/types";
import { fileExtension, formatBytes, formatTime } from "@/lib/client/format";
import { Avatar } from "@/components/ui/Avatar";
import { DownloadIcon, ExternalIcon, FileIcon, ReplyIcon, SmileIcon, TrashIcon } from "@/components/ui/icons";
import { LinkifiedText } from "./LinkifiedText";

interface MessageBubbleProps {
  message: ChatMessage;
  viewerId: string;
  isMine: boolean;
  showSender: boolean;
  active: boolean;
  highlighted: boolean;
  canAct: boolean;
  onToggleActive: (id: string) => void;
  onReply: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onQuoteClick: (id: string) => void;
  onImageClick: (src: string, name: string) => void;
}

export function QuoteBlock({
  reply,
  isMine,
  onClick,
}: {
  reply: ReplyPreview;
  isMine: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1.5 block w-full min-w-0 rounded-lg border-l-4 px-2.5 py-1.5 text-left text-xs transition ${
        isMine
          ? "border-white/70 bg-white/15 text-indigo-50 hover:bg-white/25"
          : "border-indigo-500 bg-white text-neutral-600 hover:bg-indigo-50"
      }`}
    >
      <span className={`block font-semibold ${isMine ? "text-white" : "text-indigo-700"}`}>{reply.senderName}</span>
      <span className={`line-clamp-2 [overflow-wrap:anywhere] ${reply.isDeleted ? "italic" : ""}`}>{reply.preview}</span>
    </button>
  );
}

function Attachment({
  message,
  onImageClick,
}: {
  message: ChatMessage;
  onImageClick: (src: string, name: string) => void;
}) {
  const file = message.file!;
  if (message.type === "image") {
    return (
      <button
        type="button"
        onClick={() => onImageClick(file.url, file.name)}
        className="block w-full overflow-hidden rounded-xl bg-neutral-200"
        aria-label={`Open image ${file.name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-protected, user-uploaded file */}
        <img src={file.url} alt={file.name} loading="lazy" className="max-h-80 w-full object-cover" />
      </button>
    );
  }
  if (message.type === "video") {
    return (
      <video
        src={file.url}
        controls
        playsInline
        preload="metadata"
        className="block max-h-80 w-full rounded-xl bg-black"
      />
    );
  }
  // Documents have no background of their own: icon, name and actions on the chat backdrop.
  return (
    <div className="flex items-center gap-3 py-1">
      <FileIcon className="size-9 shrink-0 text-indigo-600" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere] text-neutral-900">{file.name}</p>
        <p className="text-xs text-neutral-500">
          {fileExtension(file.name)} · {formatBytes(file.size)}
        </p>
      </div>
      <div className="flex shrink-0 gap-1 text-neutral-600">
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="grid size-10 place-items-center rounded-full hover:bg-neutral-100 hover:text-indigo-600"
          aria-label={`Open ${file.name}`}
          title="Open"
        >
          <ExternalIcon className="size-4" />
        </a>
        <a
          href={`${file.url}?download=1`}
          download={file.name}
          className="grid size-10 place-items-center rounded-full hover:bg-neutral-100 hover:text-indigo-600"
          aria-label={`Download ${file.name}`}
          title="Download"
        >
          <DownloadIcon className="size-4" />
        </a>
      </div>
    </div>
  );
}

function MessageBubbleImpl({
  message,
  viewerId,
  isMine,
  showSender,
  active,
  highlighted,
  canAct,
  onToggleActive,
  onReply,
  onDelete,
  onReact,
  onQuoteClick,
  onImageClick,
}: MessageBubbleProps) {
  const [picking, setPicking] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  // Close the reaction picker on an outside tap or Escape.
  useEffect(() => {
    if (!picking) return;
    const onDown = (e: PointerEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) setPicking(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicking(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [picking]);

  const react = (emoji: string) => {
    setPicking(false);
    onReact(message.id, emoji);
  };

  const hasMedia = !message.isDeleted && (message.type === "image" || message.type === "video");
  // Documents render as a plain file card with no colored bubble behind it.
  const isDoc = !message.isDeleted && message.type === "document";
  const tinted = isMine && !isDoc;

  const handleBubbleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button,video")) return;
    onToggleActive(message.id);
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={`group flex w-full scroll-mt-24 items-start gap-2 ${isMine ? "flex-row-reverse" : "flex-row"} ${showSender ? "mt-3" : "mt-1"}`}
    >
      {/* Avatar on the first message of a group; same-width spacer keeps the rest aligned. */}
      {showSender ? (
        <span className={!isMine ? "mt-5" : ""}>
          <Avatar name={message.senderName} id={message.senderId} />
        </span>
      ) : (
        <span className="w-8 shrink-0" aria-hidden="true" />
      )}
      <div className={`flex min-w-0 flex-1 flex-col ${isMine ? "items-end" : "items-start"}`}>
      {showSender && !isMine && (
        <span className="mb-1 px-1 text-xs font-medium text-neutral-500">{message.senderName}</span>
      )}
      <div ref={rowRef} className={`relative flex max-w-full items-center gap-1.5 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
        {/* Anchored to the bubble's outer edge so it always stays on screen. */}
        {picking && (
          <div
            role="menu"
            aria-label="React to message"
            className={`animate-slide-up absolute bottom-full z-20 mb-2 flex gap-0.5 rounded-full bg-white p-1 shadow-lg ring-1 ring-neutral-200 ${
              isMine ? "right-0" : "left-0"
            }`}
          >
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                onClick={() => react(emoji)}
                className="grid size-10 place-items-center rounded-full text-xl transition hover:scale-125 hover:bg-neutral-100"
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div
          onClick={handleBubbleClick}
          className={`relative min-w-0 rounded-2xl transition ${
            hasMedia || isDoc ? "w-64 max-w-[calc(100vw-7.5rem)] sm:w-80" : "max-w-[calc(100vw-7.5rem)] sm:max-w-md lg:max-w-lg"
          } ${
            isDoc
              ? "text-neutral-900"
              : message.isDeleted
                ? "bg-neutral-100 px-3 py-2 text-neutral-500 shadow-sm ring-1 ring-neutral-200"
                : isMine
                  ? "rounded-br-md bg-indigo-600 px-3 py-2 text-white shadow-sm"
                  : "rounded-bl-md bg-neutral-100 px-3 py-2 text-neutral-900 shadow-sm"
          } ${highlighted ? "animate-flash" : ""}`}
        >
          {message.replyTo && !message.isDeleted && (
            <QuoteBlock reply={message.replyTo} isMine={tinted} onClick={() => onQuoteClick(message.replyTo!.id)} />
          )}

          {message.isDeleted ? (
            <p className="text-sm italic">This message was deleted</p>
          ) : (
            <>
              {message.file && <Attachment message={message} onImageClick={onImageClick} />}
              {message.content && (
                <LinkifiedText
                  text={message.content}
                  className={`text-[15px] leading-snug ${message.file ? "mt-2" : ""} ${isDoc ? "px-1" : ""}`}
                />
              )}
            </>
          )}

          <span
            className={`mt-1 block text-right text-[11px] leading-none ${
              tinted && !message.isDeleted ? "text-indigo-200" : "text-neutral-400"
            } ${isDoc ? "px-1" : ""}`}
          >
            {formatTime(message.createdAt)}
          </span>
        </div>

        {canAct && !message.isDeleted && (
          <div
            className={`shrink-0 gap-0.5 transition ${
              active || picking ? "flex" : "hidden md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"
            }`}
          >
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className={`grid size-9 place-items-center rounded-full bg-white shadow-sm ring-1 ring-neutral-200 hover:text-indigo-600 ${
                picking ? "text-indigo-600" : "text-neutral-600"
              }`}
              aria-label="React"
              aria-expanded={picking}
              title="React"
            >
              <SmileIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onReply(message)}
              className="grid size-9 place-items-center rounded-full bg-white text-neutral-600 shadow-sm ring-1 ring-neutral-200 hover:text-indigo-600"
              aria-label="Reply"
              title="Reply"
            >
              <ReplyIcon className="size-4" />
            </button>
            {isMine && (
              <button
                type="button"
                onClick={() => onDelete(message)}
                className="grid size-9 place-items-center rounded-full bg-white text-neutral-600 shadow-sm ring-1 ring-neutral-200 hover:text-red-600"
                aria-label="Delete"
                title="Delete"
              >
                <TrashIcon className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {message.reactions.length > 0 && !message.isDeleted && (
        <div className={`relative z-10 -mt-1.5 flex flex-wrap gap-1 ${isMine ? "justify-end pr-2" : "pl-2"}`}>
          {message.reactions.map((r) => {
            const mine = r.userIds.includes(viewerId);
            return (
              <button
                key={r.emoji}
                type="button"
                disabled={!canAct}
                onClick={() => onReact(message.id, r.emoji)}
                aria-pressed={mine}
                aria-label={`${r.emoji} ${r.userIds.length}${mine ? ", including you. Tap to remove" : ""}`}
                title={mine ? "Tap to remove your reaction" : "Tap to react with this too"}
                className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-sm shadow-sm ring-1 transition enabled:hover:scale-105 ${
                  mine ? "bg-indigo-50 ring-indigo-300" : "bg-white ring-neutral-200"
                }`}
              >
                <span>{r.emoji}</span>
                {r.userIds.length > 1 && <span className="text-xs font-medium text-neutral-600">{r.userIds.length}</span>}
              </button>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
