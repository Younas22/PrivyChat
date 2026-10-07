"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  MessagesPage,
  ReactionGroup,
  RealtimeConfig,
  RoomEvent,
  RoomInfo,
  RoomMemberInfo,
  Viewer,
} from "@/lib/types";
import { directUpload } from "@/lib/client/direct-upload";
import { api, ApiError, uploadWithProgress } from "@/lib/client/api";
import { APP_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { Logo } from "@/components/ui/Logo";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import {
  BellIcon,
  BellOffIcon,
  CopyIcon,
  LogOutIcon,
  MenuIcon,
  MessageIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  RefreshIcon,
  XIcon,
} from "@/components/ui/icons";
import { bubbleColor, DEFAULT_BUBBLE_COLOR } from "@/lib/client/bubbleColors";
import { usePersistentFlag, usePersistentValue } from "@/lib/client/usePersistentFlag";
import { Composer, type UploadLimits } from "./Composer";
import { Lightbox } from "./Lightbox";
import { AddMemberDialog, ShareCodePanel } from "./AddMemberDialog";
import { MessageList, type MessageListHandle, type PendingText, type PendingUpload } from "./MessageList";
import { RoomNotice, type NoticeKind } from "./RoomNotice";
import { ConnectionBadge, RoomPanel } from "./RoomPanel";
import { useBell } from "./useBell";
import { useTimeZone } from "./useTimeZone";
import { formatDate } from "@/lib/client/time";
import { analyzeAudio, type AudioMeta } from "@/lib/client/audioAnalysis";
import { categoryOf } from "@/lib/client/format";
import { useRoomEvents } from "./useRoomEvents";

interface ChatRoomProps {
  initialRoom: RoomInfo;
  viewer: Viewer;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  /** This person's access code (opens their chats on another browser). */
  accessCode: string;
  limits: UploadLimits;
  realtime: RealtimeConfig;
  /** Access level for direct-to-storage uploads, or null to POST files to our own route. */
  directUploads: "public" | "private" | null;
}

type Confirm =
  | { kind: "close" }
  | { kind: "delete" }
  | { kind: "remove"; member: RoomMemberInfo }
  | { kind: "deleteMessage"; message: ChatMessage };

const byTime = (a: ChatMessage, b: ChatMessage) =>
  a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1;

function upsert(list: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort(byTime);
}

/** Same toggle rule as the server: one reaction per person, same emoji again removes it. */
function applyReaction(groups: ReactionGroup[], userId: string, emoji: string): ReactionGroup[] {
  const had = groups.find((g) => g.userIds.includes(userId))?.emoji;
  const without = groups
    .map((g) => ({ ...g, userIds: g.userIds.filter((u) => u !== userId) }))
    .filter((g) => g.userIds.length > 0);
  if (had === emoji) return without;
  const existing = without.find((g) => g.emoji === emoji);
  return existing
    ? without.map((g) => (g === existing ? { ...g, userIds: [...g.userIds, userId] } : g))
    : [...without, { emoji, userIds: [userId] }];
}

const tempId = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function ChatRoom(props: ChatRoomProps) {
  return (
    <ToastProvider>
      <ChatRoomInner {...props} />
    </ToastProvider>
  );
}

function ChatRoomInner({
  initialRoom,
  viewer: initialViewer,
  initialMessages,
  initialHasMore,
  accessCode,
  limits,
  realtime,
  directUploads,
}: ChatRoomProps) {
  const router = useRouter();
  const toast = useToast();
  const roomCode = initialRoom.roomCode;
  const base = `/api/rooms/${encodeURIComponent(roomCode)}`;

  const [room, setRoom] = useState(initialRoom);
  const [viewer, setViewer] = useState(initialViewer);
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<PendingText[]>([]);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [status, setStatus] = useState<"active" | NoticeKind>("active");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);
  // The other member's "typing…" hint; expires on its own if the "stopped" signal is lost.
  const [typingUser, setTypingUser] = useState<{ userId: string; displayName: string } | null>(null);
  const typingExpiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const listRef = useRef<MessageListHandle>(null);
  const messagesRef = useRef(messages);
  const hasMoreRef = useRef(hasMore);
  const roomRef = useRef(room);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);
  useEffect(() => {
    messagesRef.current = messages;
    hasMoreRef.current = hasMore;
  }, [messages, hasMore]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection must run after hydration
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const isSaved = room.status === "closed";

  /** Owner keeps a read-only view of a saved room; everyone else is locked out. */
  const onRoomClosed = useCallback(() => {
    if (viewer.isOwner) {
      setRoom((r) => ({ ...r, status: "closed", closedAt: r.closedAt ?? new Date().toISOString() }));
      setReplyTo(null);
    } else {
      setStatus("closed");
    }
  }, [viewer.isOwner]);

  /** Maps permission errors to the matching full-screen state; returns true if handled. */
  const handleFatal = useCallback((err: unknown) => {
    if (!(err instanceof ApiError)) return false;
    if (err.code === "room_closed") onRoomClosed();
    else if (err.code === "room_not_found") setStatus("deleted");
    else if (err.code === "no_identity") setStatus("moved"); // this browser was signed out by an access code
    else if (["member_removed", "not_member"].includes(err.code)) setStatus("removed");
    else return false;
    return true;
  }, [onRoomClosed]);

  const reportError = useCallback(
    (err: unknown) => {
      if (handleFatal(err)) return;
      toast(err instanceof Error ? err.message : "Something went wrong. Please try again.", "error");
    },
    [handleFatal, toast],
  );

  // ---------- realtime ----------

  const onEvent = useCallback(
    (event: RoomEvent) => {
      switch (event.type) {
        case "message:new":
          setMessages((list) => upsert(list, [event.message]));
          setTypingUser((t) => (t?.userId === event.message.senderId ? null : t));
          break;
        case "message:deleted":
          setMessages((list) =>
            list.map((m) => {
              if (m.id === event.messageId) return { ...m, isDeleted: true, content: null, file: null, reactions: [] };
              if (m.replyTo?.id === event.messageId)
                return { ...m, replyTo: { ...m.replyTo, isDeleted: true, preview: "Message deleted" } };
              return m;
            }),
          );
          setReplyTo((r) => (r?.id === event.messageId ? null : r));
          break;
        case "reaction:updated":
          setMessages((list) => list.map((m) => (m.id === event.messageId ? { ...m, reactions: event.reactions } : m)));
          break;
        case "room:updated":
          setRoom(event.room); // useRoomEvents also re-checks access after this event
          break;
        case "member:joined":
          setRoom(event.room);
          if (event.member.userId !== viewer.userId) {
            toast(`${event.member.displayName} ${event.member.pending ? "was added" : "joined the room"}`, "success");
          }
          break;
        case "member:removed":
          if (event.userId === viewer.userId) {
            setStatus("removed");
          } else {
            if (event.left) {
              const who = roomRef.current.members.find((m) => m.userId === event.userId)?.displayName ?? "Your friend";
              toast(`${who} left the chat`, "info");
            }
            setRoom(event.room);
          }
          break;
        case "room:closed":
          onRoomClosed();
          break;
        case "room:deleted":
          setStatus("deleted");
          break;
        case "typing":
          if (event.userId === viewer.userId) break;
          if (typingExpiry.current) clearTimeout(typingExpiry.current);
          if (event.typing) {
            setTypingUser({ userId: event.userId, displayName: event.displayName });
            typingExpiry.current = setTimeout(() => setTypingUser(null), 6000);
          } else {
            setTypingUser(null);
          }
          break;
      }
    },
    [viewer.userId, toast, onRoomClosed],
  );

  const resync = useCallback(async () => {
    try {
      const [roomRes, page] = await Promise.all([
        api<{ room: RoomInfo; viewer: Viewer }>(base),
        api<MessagesPage>(`${base}/messages`),
      ]);
      // Pusher signals carry no names, so announce new members here.
      const known = new Set(roomRef.current.members.map((m) => m.userId));
      for (const m of roomRes.room.members) {
        if (!known.has(m.userId) && m.userId !== roomRes.viewer.userId) toast(`${m.displayName} joined the room`, "success");
      }
      roomRef.current = roomRes.room;
      setRoom(roomRes.room);
      setViewer(roomRes.viewer);
      setMessages((list) => {
        const oldest = page.messages[0];
        // Keep older pages the user already loaded, replace everything in the latest window.
        const older = oldest ? list.filter((m) => byTime(m, oldest) < 0) : [];
        return upsert(older, page.messages);
      });
      // Only trust the server's hasMore if we haven't loaded older pages ourselves.
      if (messagesRef.current.length <= page.messages.length) setHasMore(page.hasMore);
    } catch (err) {
      handleFatal(err); // network errors are silent here; polling keeps retrying
    }
  }, [base, handleFatal, toast]);

  // ---------- message bell ----------

  const bell = useBell();
  const ringBell = bell.ring;
  const lastMessageId = useRef(initialMessages.at(-1)?.id);
  // Ring when a new latest message from the other person shows up (live event or refresh alike).
  useEffect(() => {
    const last = messages.at(-1);
    if (!last || last.id === lastMessageId.current) return;
    lastMessageId.current = last.id;
    if (last.senderId !== viewer.userId && !last.isDeleted) ringBell();
  }, [messages, viewer.userId, ringBell]);

  // Desktop sidebar can be hidden; each person's choice is remembered in their browser.
  const [sidebarOpen, setSidebarOpen] = usePersistentFlag("talkroom:sidebar", true);

  // Each person picks the time zone their times are shown in (kept in their browser).
  const tz = useTimeZone();

  // Each person picks the color of their own message bubbles (kept in their browser).
  const [bubbleColorId, setBubbleColorId] = usePersistentValue("talkroom:bubble", DEFAULT_BUBBLE_COLOR);
  const myBubble = bubbleColor(bubbleColorId);
  const bubbleVars = { "--bubble": myBubble.bg, "--bubble-fg": myBubble.fg } as React.CSSProperties;

  // ---------- close tab / emergency exit ----------

  // ---------- owner adds a member ----------

  const [addOpen, setAddOpen] = useState(false);
  const [memberCode, setMemberCode] = useState<{ name: string; code: string } | null>(null);
  const showMemberCode = async (member: RoomMemberInfo) => {
    try {
      const { code } = await api<{ code: string }>(`${base}/members/${member.id}/code`);
      setMemberCode({ name: member.displayName, code });
    } catch (err) {
      reportError(err);
    }
  };

  const [exiting, setExiting] = useState(false);
  /** Hide the chat at once and close the tab; browsers only let scripts close tabs they opened,
   * so otherwise replace this page with a neutral site (Back won't return to the chat). */
  const closeTab = () => {
    setExiting(true);
    window.close();
    setTimeout(() => window.location.replace("https://www.google.com"), 150);
  };
  /** Emergency exit (members only): leave the room for good, then close the tab. No confirmation. */
  const emergencyExit = () => {
    void fetch(`${base}/leave`, { method: "POST", keepalive: true }).catch(() => {});
    closeTab();
  };

  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([resync(), new Promise((r) => setTimeout(r, 400))]); // keep the spin visible
    setRefreshing(false);
    toast("Chat updated", "success");
  };

  const toggleBell = () => {
    const on = bell.toggle();
    toast(on ? "Message sound on" : "Message sound off", "success");
  };

  const connection = useRoomEvents(roomCode, status === "active" && !isSaved, realtime, room.channel, {
    onEvent,
    onResync: resync,
  });

  // ---------- messages ----------

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (!oldest || !hasMoreRef.current) return false;
    setLoadingOlder(true);
    try {
      const page = await api<MessagesPage>(`${base}/messages?before=${encodeURIComponent(oldest.id)}`);
      listRef.current?.preserveScroll();
      setMessages((list) => upsert(list, page.messages));
      setHasMore(page.hasMore);
      hasMoreRef.current = page.hasMore;
      return true;
    } catch (err) {
      reportError(err);
      return false;
    } finally {
      setLoadingOlder(false);
    }
  }, [base, reportError]);

  const sendText = useCallback(
    async (item: PendingText) => {
      try {
        const { message } = await api<{ message: ChatMessage }>(`${base}/messages`, {
          method: "POST",
          json: { content: item.content, replyToMessageId: item.replyTo?.id ?? null },
        });
        setPending((p) => p.filter((x) => x.tempId !== item.tempId));
        setMessages((list) => upsert(list, [message]));
      } catch (err) {
        if (handleFatal(err)) return;
        setPending((p) => p.map((x) => (x.tempId === item.tempId ? { ...x, status: "failed" } : x)));
        toast(err instanceof Error ? err.message : "Message failed to send.", "error");
      }
    },
    [base, handleFatal, toast],
  );

  // ---------- typing hint (sender side) ----------

  const typingState = useRef({ active: false, lastSent: 0, stopTimer: null as ReturnType<typeof setTimeout> | null });

  const sendTyping = useCallback(
    (typing: boolean) => {
      void fetch(`${base}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typing }),
        keepalive: true,
      }).catch(() => {});
    },
    [base],
  );

  const stopTyping = useCallback(() => {
    const t = typingState.current;
    if (t.stopTimer) clearTimeout(t.stopTimer);
    t.stopTimer = null;
    if (t.active) {
      t.active = false;
      sendTyping(false);
    }
  }, [sendTyping]);

  /** Called on each keystroke: tells the other side at most every 2.5 s, stops after 4 s idle. */
  const onUserTyping = useCallback(() => {
    if (roomRef.current.members.length < 2 || roomRef.current.status !== "open") return;
    const t = typingState.current;
    const now = Date.now();
    if (!t.active || now - t.lastSent > 2500) {
      t.active = true;
      t.lastSent = now;
      sendTyping(true);
    }
    if (t.stopTimer) clearTimeout(t.stopTimer);
    t.stopTimer = setTimeout(stopTyping, 4000);
  }, [sendTyping, stopTyping]);

  useEffect(() => stopTyping, [stopTyping]);

  const onSendText = (content: string) => {
    stopTyping();
    const item: PendingText = { tempId: tempId(), content, replyTo, status: "sending" };
    setPending((p) => [...p, item]);
    setReplyTo(null);
    void sendText(item);
  };

  const sendFile = useCallback(
    async (item: PendingUpload) => {
      const onProgress = (progress: number) =>
        setUploads((u) => u.map((x) => (x.tempId === item.tempId ? { ...x, progress } : x)));
      try {
        // Audio files picked with 📎 are measured here; recordings arrive already measured.
        const audioMeta =
          item.audioMeta ?? (categoryOf(item.file.name) === "audio" ? await analyzeAudio(item.file) : null);
        let message: ChatMessage;
        if (directUploads) {
          ({ message } = await directUpload({
            base,
            roomId: roomRef.current.id,
            access: directUploads,
            file: item.file,
            caption: item.caption,
            replyToMessageId: item.replyTo?.id ?? null,
            audioMeta,
            onProgress,
          }));
        } else {
          const form = new FormData();
          form.append("file", item.file);
          if (item.caption) form.append("caption", item.caption);
          if (item.replyTo) form.append("replyToMessageId", item.replyTo.id);
          if (audioMeta) {
            form.append("durationMs", String(audioMeta.durationMs));
            if (audioMeta.waveform) form.append("waveform", audioMeta.waveform);
          }
          ({ message } = await uploadWithProgress<{ message: ChatMessage }>(`${base}/upload`, form, onProgress));
        }
        setUploads((u) => u.filter((x) => x.tempId !== item.tempId));
        setMessages((list) => upsert(list, [message]));
      } catch (err) {
        if (handleFatal(err)) return;
        const error = err instanceof Error ? err.message : "Upload failed.";
        setUploads((u) => u.map((x) => (x.tempId === item.tempId ? { ...x, status: "failed", error } : x)));
        toast(error, "error");
      }
    },
    [base, handleFatal, toast, directUploads],
  );

  const onSendFile = (file: File, caption: string, audioMeta?: AudioMeta) => {
    stopTyping();
    const item: PendingUpload = {
      tempId: tempId(),
      file,
      caption,
      replyTo,
      progress: 0,
      status: "uploading",
      audioMeta,
    };
    setUploads((u) => [...u, item]);
    setReplyTo(null);
    void sendFile(item);
  };

  const scrollToMessage = useCallback(
    async (id: string) => {
      let el = document.getElementById(`msg-${id}`);
      for (let i = 0; !el && i < 20 && hasMoreRef.current; i++) {
        if (!(await loadOlder())) break;
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        el = document.getElementById(`msg-${id}`);
      }
      if (!el) return toast("The original message is no longer available.", "info");
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(id);
      setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1700);
    },
    [loadOlder, toast],
  );

  // ---------- room actions ----------

  const roomUrl = () => `${window.location.origin}/chat/${roomCode}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl());
    } catch {
      const input = document.createElement("textarea");
      input.value = roomUrl();
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    toast("Room link copied", "success");
  };

  const shareLink = async () => {
    try {
      await navigator.share({ title: APP_NAME, text: `Join my chat room "${room.name}"`, url: roomUrl() });
    } catch {
      /* user cancelled */
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "close") {
        await api(`${base}/close`, { method: "POST" });
        onRoomClosed();
        toast("Room saved. You can find it anytime in My Rooms.", "success");
      } else if (confirm.kind === "delete") {
        await api(base, { method: "DELETE" });
        router.replace("/");
        return;
      } else if (confirm.kind === "remove") {
        await api(`${base}/members/${confirm.member.id}`, { method: "DELETE" });
        setRoom((r) => ({ ...r, members: r.members.filter((m) => m.id !== confirm.member.id) }));
        toast(`${confirm.member.displayName} was removed`, "success");
      } else {
        await api(`${base}/messages/${confirm.message.id}`, { method: "DELETE" });
        onEvent({ type: "message:deleted", messageId: confirm.message.id });
      }
      setConfirm(null);
    } catch (err) {
      setConfirm(null);
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ room: RoomInfo }>(base, { method: "PATCH", json: { name: renameValue } });
      setRoom(res.room);
      setRenameOpen(false);
      toast("Room renamed", "success");
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  // ---------- reactions ----------

  const onReact = useCallback(
    async (messageId: string, emoji: string) => {
      // Show it instantly, then take the server's answer as the truth.
      setMessages((list) =>
        list.map((m) => (m.id === messageId ? { ...m, reactions: applyReaction(m.reactions, viewer.userId, emoji) } : m)),
      );
      try {
        const { reactions } = await api<{ reactions: ReactionGroup[] }>(
          `${base}/messages/${encodeURIComponent(messageId)}/reaction`,
          { method: "PUT", json: { emoji } },
        );
        setMessages((list) => list.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
      } catch (err) {
        reportError(err);
        void resync(); // undo the optimistic change
      }
    },
    [base, viewer.userId, reportError, resync],
  );

  const onReply = useCallback((m: ChatMessage) => setReplyTo(m), []);
  const onDelete = useCallback((m: ChatMessage) => setConfirm({ kind: "deleteMessage", message: m }), []);
  const onImageClick = useCallback((src: string, name: string) => setLightbox({ src, name }), []);

  if (exiting) return <div className="h-dvh bg-white" aria-hidden="true" />;
  if (status !== "active") {
    return <RoomNotice kind={status} codeNext={status === "moved" ? `/chat/${roomCode}` : undefined} />;
  }

  const isAlone = room.members.length < 2;
  const panel = (
    <RoomPanel
      room={room}
      viewer={viewer}
      timeZonePreference={tz.preference}
      detectedTimeZone={tz.detected}
      onTimeZone={(zone) => {
        tz.setPreference(zone);
        toast(zone === "auto" ? "Time zone: automatic" : `Time zone: ${zone.replace(/_/g, " ")}`, "success");
      }}
      accessCode={accessCode}
      onCodeNotice={(text, kind) => toast(text, kind)}
      bubbleColorId={myBubble.id}
      onBubbleColor={(id) => {
        setBubbleColorId(id);
        toast(`Chat color: ${bubbleColor(id).name}`, "success");
      }}
      connection={connection}
      canShare={canShare}
      onCopyLink={copyLink}
      onRefresh={() => {
        setSheetOpen(false);
        void refresh();
      }}
      onShare={shareLink}
      onRename={() => {
        setRenameValue(room.name);
        setRenameOpen(true);
        setSheetOpen(false);
      }}
      onCloseRoom={() => {
        setConfirm({ kind: "close" });
        setSheetOpen(false);
      }}
      onDeleteRoom={() => {
        setConfirm({ kind: "delete" });
        setSheetOpen(false);
      }}
      onRemoveMember={(member) => {
        setConfirm({ kind: "remove", member });
        setSheetOpen(false);
      }}
      onAddMember={() => {
        setAddOpen(true);
        setSheetOpen(false);
      }}
      onShowMemberCode={(member) => {
        setSheetOpen(false);
        void showMemberCode(member);
      }}
    />
  );

  const confirmCopy: Record<Confirm["kind"], { title: string; message: string; label: string }> = {
    close: {
      title: "Save & Close Room",
      message:
        "Save and close this room? Your friend won't be able to open it again and no new messages can be sent. You can still read it from My Rooms.",
      label: "Save & Close",
    },
    delete: {
      title: "Delete room",
      message: "Permanently delete this room, all messages and uploaded files? This cannot be undone.",
      label: "Delete Room",
    },
    remove: {
      title: "Remove member",
      message: `Remove ${confirm?.kind === "remove" ? confirm.member.displayName : "this member"} from the room? They won't be able to read or send messages here anymore.`,
      label: "Remove",
    },
    deleteMessage: {
      title: "Delete message",
      message: "Delete this message for everyone? This cannot be undone.",
      label: "Delete",
    },
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-white" style={bubbleVars}>
      {/* Desktop sidebar */}
      <aside className={`hidden w-80 shrink-0 flex-col bg-neutral-950 ${sidebarOpen ? "lg:flex" : ""}`}>
        <div className="flex items-center justify-between px-5 py-4">
          <Logo dark />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="-mr-2 grid size-10 place-items-center rounded-xl text-neutral-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            <PanelLeftCloseIcon className="size-5" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 pb-6">{panel}</div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b sm:gap-3 border-neutral-200 bg-white px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-5">
          <Link href="/" className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white lg:hidden" aria-label={`${APP_NAME} home`}>
            <MessageIcon className="size-4" />
          </Link>
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="hidden size-10 shrink-0 place-items-center rounded-xl text-neutral-700 ring-1 ring-neutral-200 transition hover:bg-neutral-50 lg:grid"
              aria-label="Show sidebar"
              title="Show sidebar"
            >
              <PanelLeftOpenIcon className="size-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-neutral-950">{room.name}</h1>
            <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap text-neutral-500">
              {typingUser && !isSaved ? (
                <span className="truncate text-xs font-medium text-indigo-600">{typingUser.displayName} is typing…</span>
              ) : (
                <>
                  <span className="text-xs">
                    {room.members.length} {room.members.length === 1 ? "Member" : "Members"}
                  </span>
                  <span className="text-neutral-300">·</span>
                  {isSaved ? (
                    <span className="text-xs font-medium text-neutral-700">
                      Saved<span className="hidden sm:inline"> · read-only</span>
                    </span>
                  ) : (
                    <ConnectionBadge connection={connection} />
                  )}
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="hidden size-10 shrink-0 place-items-center rounded-xl text-neutral-700 ring-1 ring-neutral-200 transition hover:bg-neutral-50 sm:grid"
            aria-label="Refresh chat"
            title="Refresh"
          >
            <RefreshIcon className={`size-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {!isSaved && (
            <button
              type="button"
              onClick={toggleBell}
              aria-pressed={bell.enabled}
              aria-label={bell.enabled ? "Turn message sound off" : "Turn message sound on"}
              title={bell.enabled ? "Sound on" : "Sound off"}
              className={`grid size-10 shrink-0 place-items-center rounded-xl ring-1 transition ${
                bell.enabled
                  ? "text-indigo-600 ring-indigo-200 hover:bg-indigo-50"
                  : "text-neutral-400 ring-neutral-200 hover:bg-neutral-50"
              }`}
            >
              {bell.enabled ? <BellIcon className="size-5" /> : <BellOffIcon className="size-5" />}
            </button>
          )}
          {isSaved ? (
            <Link
              href="/rooms"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50"
            >
              My Rooms
            </Link>
          ) : (
            <button
              type="button"
              onClick={copyLink}
              className="hidden min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50 sm:inline-flex"
            >
              <CopyIcon className="size-4" />
              Copy Link
            </button>
          )}
          <button
            type="button"
            onClick={closeTab}
            className="grid size-10 shrink-0 place-items-center rounded-xl text-neutral-700 ring-1 ring-neutral-200 transition hover:bg-neutral-50"
            aria-label="Close tab"
            title="Close tab"
          >
            <XIcon className="size-5" />
          </button>
          {!viewer.isOwner && !isSaved && (
            <button
              type="button"
              onClick={emergencyExit}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-red-600 px-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 sm:px-3"
              aria-label="Emergency exit: leave the chat and close the tab"
              title="Emergency exit: leave the chat and close the tab"
            >
              <LogOutIcon className="size-5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="grid size-10 place-items-center rounded-xl text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50 lg:hidden"
            aria-label="Room menu"
          >
            <MenuIcon className="size-5" />
          </button>
        </header>

        <MessageList
          ref={listRef}
          messages={messages}
          pending={pending}
          uploads={uploads}
          viewerId={viewer.userId}
          hasMore={hasMore}
          loadingOlder={loadingOlder}
          highlightedId={highlightedId}
          canAct={!isSaved}
          isAlone={isAlone && !isSaved}
          timeZone={tz.timeZone}
          typingUser={isSaved ? null : typingUser}
          onLoadOlder={loadOlder}
          onReply={onReply}
          onDelete={onDelete}
          onReact={onReact}
          onQuoteClick={scrollToMessage}
          onImageClick={onImageClick}
          onRetryText={(id) => {
            const item = pending.find((p) => p.tempId === id);
            if (!item) return;
            setPending((p) => p.map((x) => (x.tempId === id ? { ...x, status: "sending" } : x)));
            void sendText(item);
          }}
          onDiscardText={(id) => setPending((p) => p.filter((x) => x.tempId !== id))}
          onRetryUpload={(id) => {
            const item = uploads.find((u) => u.tempId === id);
            if (!item) return;
            const reset = { ...item, status: "uploading" as const, progress: 0, error: undefined };
            setUploads((u) => u.map((x) => (x.tempId === id ? reset : x)));
            void sendFile(reset);
          }}
          onDiscardUpload={(id) => setUploads((u) => u.filter((x) => x.tempId !== id))}
          onCopyLink={copyLink}
        />

        {isSaved ? (
          <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-neutral-600">
            This room was saved{room.closedAt ? ` on ${formatDate(room.closedAt, tz.timeZone)}` : ""}. You can read it, but no new messages can be sent.
          </div>
        ) : (
        <Composer
          replyTo={replyTo}
          limits={limits}
          onCancelReply={() => setReplyTo(null)}
          onSendText={onSendText}
          onTyping={onUserTyping}
          onSendFile={onSendFile}
          onError={(m) => toast(m, "error")}
        />
        )}
      </section>

      {/* Mobile / tablet room sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-neutral-950/60" onClick={() => setSheetOpen(false)} />
          <div className="animate-slide-up scrollbar-thin absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-neutral-950 px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <span className="mx-auto h-1.5 w-10 rounded-full bg-white/20" />
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="absolute top-3 right-3 grid size-10 place-items-center rounded-full text-neutral-400 hover:bg-white/10"
              aria-label="Close menu"
            >
              <XIcon className="size-5" />
            </button>
            {panel}
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          open
          title={confirmCopy[confirm.kind].title}
          message={confirmCopy[confirm.kind].message}
          confirmLabel={confirmCopy[confirm.kind].label}
          destructive={confirm.kind !== "close"}
          loading={busy}
          onConfirm={runConfirm}
          onClose={() => setConfirm(null)}
        />
      )}

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename room" locked={busy}>
        <form onSubmit={submitRename} className="space-y-4">
          <input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={80}
            required
            autoFocus
            placeholder="e.g. Alex & Sam"
            className="block min-h-12 w-full rounded-xl border-0 px-4 text-base text-neutral-950 ring-1 ring-inset ring-neutral-300 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setRenameOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!renameValue.trim()}>
              Save name
            </Button>
          </div>
        </form>
      </Dialog>

      <AddMemberDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        base={base}
        memberUserIds={room.members.map((m) => m.userId)}
        onNotice={(text, kind) => toast(text, kind)}
      />

      <Dialog open={!!memberCode} onClose={() => setMemberCode(null)} title={`${memberCode?.name ?? ""}'s code`}>
        {memberCode && (
          <ShareCodePanel
            name={memberCode.name}
            code={memberCode.code}
            onDone={() => setMemberCode(null)}
            onNotice={(text, kind) => toast(text, kind)}
          />
        )}
      </Dialog>

      {lightbox && <Lightbox src={lightbox.src} name={lightbox.name} onClose={() => setLightbox(null)} />}
    </div>
  );
}
