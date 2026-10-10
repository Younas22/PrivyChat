"use client";

import { memo, useEffect, useRef, useState } from "react";
import { REACTION_EMOJIS, type ChatMessage, type ReplyPreview } from "@/lib/types";
import { fileExtension, formatBytes } from "@/lib/client/format";
import { formatTime } from "@/lib/client/time";
import { Avatar } from "@/components/ui/Avatar";
import { DoubleCheckIcon, DownloadIcon, ExternalIcon, FileIcon, PencilIcon, ReplyIcon, SmileIcon, TrashIcon } from "@/components/ui/icons";
import { LinkifiedText } from "./LinkifiedText";
import { VoicePlayer } from "./VoicePlayer";

interface MessageBubbleProps {
  message: ChatMessage;
  viewerId: string;
  /** IANA zone used for the timestamp (viewer's choice). */
  timeZone: string;
  isMine: boolean;
  receiptStatus?: "offline" | "online" | "read";
  showSender: boolean;
  active: boolean;
  highlighted: boolean;
  canAct: boolean;
  onToggleActive: (id: string) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
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
      // Inside my bubble the quote is tinted from the bubble's text color, so it suits any chosen color.
      style={
        isMine
          ? {
              color: "var(--bubble-fg)",
              backgroundColor: "color-mix(in srgb, var(--bubble-fg) 14%, transparent)",
              borderColor: "color-mix(in srgb, var(--bubble-fg) 60%, transparent)",
            }
          : undefined
      }
      className={`mb-1.5 block w-full min-w-0 rounded-lg border-l-4 px-2.5 py-1.5 text-left text-xs transition hover:opacity-90 ${
        isMine ? "" : "border-indigo-500 bg-white text-neutral-600 hover:bg-indigo-50"
      }`}
    >
      <span className={`block font-semibold ${isMine ? "" : "text-indigo-700"}`}>{reply.senderName}</span>
      <span className={`line-clamp-2 [overflow-wrap:anywhere] ${isMine ? "opacity-80" : ""} ${reply.isDeleted ? "italic" : ""}`}>
        {reply.preview}
      </span>
    </button>
  );
}

function Attachment({
  message,
  tinted,
  onImageClick,
}: {
  message: ChatMessage;
  tinted: boolean;
  onImageClick: (src: string, name: string) => void;
}) {
  const file = message.file!;
  if (message.type === "audio") {
    return <VoicePlayer src={file.url} tinted={tinted} durationMs={file.durationMs} waveform={file.waveform} />;
  }
  if (message.type === "image") {
    return (
      <button
        type="button"
        onClick={() => onImageClick(file.url, file.name)}
        className="block overflow-hidden rounded-2xl bg-neutral-200"
        aria-label={`Open image ${file.name}`}
      >
        {/* Whole picture at its own shape (no cropping); big but never taller than most of the screen. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- auth-protected, user-uploaded file */}
        <img
          src={file.url}
          alt={file.name}
          loading="lazy"
          className="block h-auto max-h-[min(36rem,65vh)] w-auto max-w-full min-w-48 object-contain"
        />
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
        className="block max-h-80 w-full rounded-2xl bg-black"
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
  timeZone,
  isMine,
  receiptStatus,
  showSender,
  active,
  highlighted,
  canAct,
  onToggleActive,
  onReply,
  onEdit,
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
  const isImage = !message.isDeleted && message.type === "image";
  // Photos, videos and documents sit directly on the chat (no bubble behind them).
  const isDoc = !message.isDeleted && message.type === "document";
  const plain = isDoc || hasMedia;
  // Only my text bubbles use my chosen color (CSS vars --bubble / --bubble-fg set by ChatRoom).
  const tinted = isMine && !plain;
  const hasReactions = message.reactions.length > 0 && !message.isDeleted;

  const handleBubbleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("a,button,video")) return;
    onToggleActive(message.id);
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={`group flex w-full scroll-mt-24 items-start gap-2 ${isMine ? "flex-row" : "flex-row-reverse"} ${showSender || hasReactions ? "mt-4" : "mt-1"}`}
    >
      {/* Avatar on the first message of a group; same-width spacer keeps the rest aligned. */}
      {showSender ? (
        <span>
          <Avatar name={message.senderName} id={message.senderId} />
        </span>
      ) : (
        <span className="w-8 shrink-0" aria-hidden="true" />
      )}
      <div className={`flex min-w-0 flex-1 flex-col ${isMine ? "items-start" : "items-end"}`}>
      <div ref={rowRef} className={`relative flex max-w-full items-center gap-1.5 ${isMine ? "flex-row" : "flex-row-reverse"}`}>
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
            isImage
              ? "max-w-[min(calc(100vw-7.5rem),28rem)] lg:max-w-[32rem]"
              : hasMedia || isDoc
                ? "w-64 max-w-[calc(100vw-7.5rem)] sm:w-80"
                : "max-w-[calc(100vw-7.5rem)] sm:max-w-md lg:max-w-lg"
          } ${
            plain
              ? "text-neutral-900"
              : message.isDeleted
                ? "bg-neutral-100 px-3 py-2 text-neutral-500 shadow-sm ring-1 ring-neutral-200"
                : isMine
                  ? "rounded-bl-md bg-(--bubble) px-3 py-2 text-(--bubble-fg) shadow-sm"
                  : "rounded-br-md bg-neutral-100 px-3 py-2 text-neutral-900 shadow-sm"
          } ${highlighted ? "animate-flash" : ""}`}
        >
          {/* Reactions as a corner badge: top-right on their messages, top-left on mine. */}
          {hasReactions && (
            <div className={`absolute -top-3 z-10 flex gap-1 ${isMine ? "-left-2" : "-right-2"}`}>
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
                    // Just the emoji (and a count): no background, border or shadow behind it.
                    className="inline-flex items-center gap-0.5 text-lg leading-none transition enabled:hover:scale-110"
                  >
                    <span>{r.emoji}</span>
                    {r.userIds.length > 1 && <span className="text-xs font-semibold text-neutral-500">{r.userIds.length}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {message.replyTo && !message.isDeleted && (
            <QuoteBlock reply={message.replyTo} isMine={tinted} onClick={() => onQuoteClick(message.replyTo!.id)} />
          )}

          {message.isDeleted ? (
            <p className="text-sm italic">This message was deleted</p>
          ) : (
            <>
              {message.file && <Attachment message={message} tinted={tinted} onImageClick={onImageClick} />}
              {message.content && (
                <LinkifiedText
                  text={message.content}
                  className={`text-[15px] leading-snug ${message.file ? "mt-2" : ""} ${plain ? "px-1" : ""}`}
                />
              )}
            </>
          )}

          <span
            style={tinted && !message.isDeleted ? { color: "var(--bubble-fg)", opacity: 0.7 } : undefined}
            className={`mt-1 block text-right text-[11px] leading-none ${
              tinted && !message.isDeleted ? "" : "text-neutral-400"
            } ${plain ? "px-1" : ""}`}
          >
            {formatTime(message.createdAt, timeZone)}
            {message.isEdited && <span className="ml-1">edited</span>}
            {isMine && receiptStatus && (
              <span
                className={`ml-1 inline-flex align-[-2px] ${receiptStatus === "read" ? "text-emerald-500" : "text-neutral-400"}`}
                title={receiptStatus === "read" ? "Seen" : receiptStatus === "online" ? "Delivered · recipient online" : "Sent · recipient offline"}
                aria-label={receiptStatus === "read" ? "Seen" : receiptStatus === "online" ? "Delivered" : "Sent"}
              >
                {receiptStatus === "offline" ? <span className="text-[13px] font-semibold leading-none">✓</span> : <DoubleCheckIcon className="size-3.5" />}
              </span>
            )}
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
            {isMine && message.content !== null && (
              <button
                type="button"
                onClick={() => onEdit(message)}
                className="grid size-9 place-items-center rounded-full bg-white text-neutral-600 shadow-sm ring-1 ring-neutral-200 hover:text-indigo-600"
                aria-label="Edit message"
                title="Edit message"
              >
                <PencilIcon className="size-4" />
              </button>
            )}
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

      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
