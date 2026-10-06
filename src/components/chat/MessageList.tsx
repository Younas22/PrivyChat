"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { formatBytes, formatDay } from "@/lib/client/format";
import { AlertIcon, ArrowDownIcon, CopyIcon, FileIcon, MessageIcon, RefreshIcon, XIcon } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { MessageBubble, QuoteBlock } from "./MessageBubble";
import { LinkifiedText } from "./LinkifiedText";

export interface PendingText {
  tempId: string;
  content: string;
  replyTo: ChatMessage | null;
  status: "sending" | "failed";
}

export interface PendingUpload {
  tempId: string;
  file: File;
  caption: string;
  replyTo: ChatMessage | null;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
}

export interface MessageListHandle {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Called before older messages are prepended so the viewport stays in place. */
  preserveScroll: () => void;
}

interface MessageListProps {
  messages: ChatMessage[];
  pending: PendingText[];
  uploads: PendingUpload[];
  viewerId: string;
  hasMore: boolean;
  loadingOlder: boolean;
  highlightedId: string | null;
  canAct: boolean;
  isAlone: boolean;
  /** The other member while they are typing, or null. */
  typingUser: { userId: string; displayName: string } | null;
  onLoadOlder: () => void;
  onReply: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onQuoteClick: (id: string) => void;
  onImageClick: (src: string, name: string) => void;
  onRetryText: (tempId: string) => void;
  onDiscardText: (tempId: string) => void;
  onRetryUpload: (tempId: string) => void;
  onDiscardUpload: (tempId: string) => void;
  onCopyLink: () => void;
}

const NEAR_BOTTOM_PX = 120;

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(function MessageList(props, ref) {
  const { messages, pending, uploads, viewerId } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevScroll = useRef<{ height: number; top: number } | null>(null);
  const lastMessageId = useRef<string | null>(messages.at(-1)?.id ?? null);
  const [showJump, setShowJump] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom,
      preserveScroll: () => {
        const el = scrollRef.current;
        if (el) prevScroll.current = { height: el.scrollHeight, top: el.scrollTop };
      },
    }),
    [scrollToBottom],
  );

  // Start at the latest message.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Keep the viewport stable when older messages are prepended; handle newly arrived messages.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prevScroll.current) {
      el.scrollTop = prevScroll.current.top + (el.scrollHeight - prevScroll.current.height);
      prevScroll.current = null;
      return;
    }
    const last = messages.at(-1);
    if (last && last.id !== lastMessageId.current) {
      lastMessageId.current = last.id;
      if (stickToBottom.current || last.senderId === viewerId) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } else {
        setShowJump(true);
      }
    }
  }, [messages, viewerId]);

  // Pending items are always mine: follow them.
  useEffect(() => {
    if (pending.length || uploads.length) scrollToBottom();
  }, [pending.length, uploads.length, scrollToBottom]);

  // Media loading changes heights; stay pinned to the bottom when the user is there.
  useEffect(() => {
    const content = contentRef.current;
    const el = scrollRef.current;
    if (!content || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stickToBottom.current && !prevScroll.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickToBottom.current = near;
    if (near) setShowJump(false);
    if (el.scrollTop < 80 && props.hasMore && !props.loadingOlder) props.onLoadOlder();
  };

  const toggleActive = useCallback((id: string) => setActiveId((cur) => (cur === id ? null : id)), []);

  const isEmpty = messages.length === 0 && pending.length === 0 && uploads.length === 0 && !props.typingUser;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <div ref={contentRef} className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-3 py-4 sm:px-6">
          {props.hasMore && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={props.onLoadOlder}
                disabled={props.loadingOlder}
                className="inline-flex min-h-9 items-center gap-2 rounded-full bg-neutral-100 px-4 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
              >
                {props.loadingOlder && <Spinner className="size-3.5" />}
                {props.loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            </div>
          )}

          {isEmpty ? (
            <div className="m-auto flex max-w-sm flex-col items-center py-10 text-center">
              <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
                <MessageIcon className="size-7" />
              </span>
              <h3 className="font-semibold text-neutral-900">No messages yet</h3>
              <p className="mt-1 text-sm text-neutral-500">
                {props.isAlone
                  ? "Share the room link with your friend. Once they join, you can start chatting."
                  : "Say hello and start the conversation 👋"}
              </p>
              {props.isAlone && (
                <button
                  type="button"
                  onClick={props.onCopyLink}
                  className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                >
                  <CopyIcon className="size-4" /> Copy room link
                </button>
              )}
            </div>
          ) : (
            <div className="mt-auto">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || formatDay(prev.createdAt) !== formatDay(m.createdAt);
                const isMine = m.senderId === viewerId;
                const showSender = newDay || !prev || prev.senderId !== m.senderId;
                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="my-4 flex justify-center">
                        <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-medium text-neutral-500">
                          {formatDay(m.createdAt)}
                        </span>
                      </div>
                    )}
                    <MessageBubble
                      message={m}
                      viewerId={viewerId}
                      onReact={props.onReact}
                      isMine={isMine}
                      showSender={showSender}
                      active={activeId === m.id}
                      highlighted={props.highlightedId === m.id}
                      canAct={props.canAct}
                      onToggleActive={toggleActive}
                      onReply={props.onReply}
                      onDelete={props.onDelete}
                      onQuoteClick={props.onQuoteClick}
                      onImageClick={props.onImageClick}
                    />
                  </div>
                );
              })}

              {props.typingUser && (
                <div className="mt-3 flex items-end gap-2" aria-live="polite">
                  <Avatar name={props.typingUser.displayName} id={props.typingUser.userId} />
                  <div
                    className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-neutral-100 px-4 py-3 shadow-sm"
                    title={`${props.typingUser.displayName} is typing…`}
                  >
                    <span className="sr-only">{props.typingUser.displayName} is typing…</span>
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="size-2 animate-bounce rounded-full bg-neutral-400"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {pending.map((p) => (
                <div key={p.tempId} className="mt-1 flex flex-col items-end pr-10">
                  <div className="max-w-[calc(100vw-7.5rem)] rounded-2xl rounded-br-md bg-indigo-600 px-3 py-2 text-white opacity-80 shadow-sm sm:max-w-md lg:max-w-lg">
                    {p.replyTo && (
                      <QuoteBlock
                        isMine
                        reply={{
                          id: p.replyTo.id,
                          senderName: p.replyTo.senderName,
                          type: p.replyTo.type,
                          preview: p.replyTo.content ?? p.replyTo.file?.name ?? "Message",
                          isDeleted: false,
                        }}
                      />
                    )}
                    <LinkifiedText text={p.content} className="text-[15px] leading-snug" />
                  </div>
                  <PendingStatus
                    failed={p.status === "failed"}
                    label={p.status === "failed" ? "Not sent" : "Sending…"}
                    onRetry={() => props.onRetryText(p.tempId)}
                    onDiscard={() => props.onDiscardText(p.tempId)}
                  />
                </div>
              ))}

              {uploads.map((u) => (
                <div key={u.tempId} className="mt-1 flex flex-col items-end pr-10">
                  <div className="w-64 max-w-[calc(100vw-7.5rem)] rounded-2xl rounded-br-md bg-indigo-600 p-3 text-white shadow-sm sm:w-72">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/15">
                        {u.status === "failed" ? <AlertIcon className="size-5" /> : <FileIcon className="size-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.file.name}</p>
                        <p className="text-xs text-indigo-100">
                          {u.status === "failed" ? u.error : `${Math.round(u.progress * 100)}% of ${formatBytes(u.file.size)}`}
                        </p>
                      </div>
                    </div>
                    {u.status === "uploading" && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                        <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${u.progress * 100}%` }} />
                      </div>
                    )}
                  </div>
                  {u.status === "failed" && (
                    <PendingStatus
                      failed
                      label="Upload failed"
                      onRetry={() => props.onRetryUpload(u.tempId)}
                      onDiscard={() => props.onDiscardUpload(u.tempId)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          className="animate-slide-up absolute bottom-4 left-1/2 inline-flex min-h-10 -translate-x-1/2 items-center gap-2 rounded-full bg-neutral-950 px-4 text-xs font-semibold text-white shadow-lg"
        >
          <ArrowDownIcon className="size-4" /> New messages
        </button>
      )}
    </div>
  );
});

function PendingStatus({
  failed,
  label,
  onRetry,
  onDiscard,
}: {
  failed: boolean;
  label: string;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  if (!failed) return <span className="mt-1 px-1 text-[11px] text-neutral-400">{label}</span>;
  return (
    <div className="mt-1 flex items-center gap-1 text-[11px] text-red-600">
      <AlertIcon className="size-3.5" /> {label}
      <button type="button" onClick={onRetry} className="ml-1 inline-flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold hover:bg-red-50">
        <RefreshIcon className="size-3.5" /> Retry
      </button>
      <button type="button" onClick={onDiscard} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 font-semibold text-neutral-500 hover:bg-neutral-100">
        <XIcon className="size-3.5" /> Discard
      </button>
    </div>
  );
}
