// Shared DTOs exchanged between server and client. Never include anonymousId here.

export type MessageType = "text" | "image" | "video" | "document" | "audio";

/** Quick reactions offered on every message (validated server-side). */
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

/** One emoji and everyone who reacted with it, in the order reactions were first added. */
export interface ReactionGroup {
  emoji: string;
  userIds: string[];
}

export interface FileInfo {
  name: string;
  url: string;
  mimeType: string;
  size: number;
  /** Audio only: exact length in ms (null for older messages). */
  durationMs: number | null;
  /** Audio only: loudness bars, one base-32 digit (0-v) per bar. */
  waveform: string | null;
}

/** Validates client-measured audio details (cosmetic, so bad values are simply dropped). */
export function parseAudioMeta(durationMs: unknown, waveform: unknown) {
  const ms = Number(durationMs);
  return {
    durationMs: Number.isInteger(ms) && ms > 0 && ms <= 60 * 60 * 1000 ? ms : null,
    waveform: typeof waveform === "string" && /^[0-9a-v]{8,64}$/.test(waveform) ? waveform : null,
  };
}

export interface ReplyPreview {
  id: string;
  senderName: string;
  type: MessageType;
  preview: string;
  isDeleted: boolean;
}

export interface ChatMessage {
  id: string;
  type: MessageType;
  content: string | null;
  senderId: string;
  senderName: string;
  createdAt: string;
  isDeleted: boolean;
  file: FileInfo | null;
  replyTo: ReplyPreview | null;
  reactions: ReactionGroup[];
}

export interface RoomMemberInfo {
  id: string;
  userId: string;
  displayName: string;
  isOwner: boolean;
  joinedAt: string;
}

export interface RoomInfo {
  id: string;
  roomCode: string;
  name: string;
  status: "open" | "closed";
  ownerId: string;
  members: RoomMemberInfo[];
  createdAt: string;
  closedAt: string | null;
  /** Live-update channel for the current member set (Pusher), or null for local SSE. */
  channel: string | null;
}

export interface Viewer {
  userId: string;
  displayName: string;
  isOwner: boolean;
}

/** How the browser receives live updates: Pusher in production, local SSE otherwise. */
export type RealtimeConfig = { provider: "pusher"; key: string; cluster: string } | { provider: "sse" };

export type RoomEvent =
  | { type: "message:new"; message: ChatMessage }
  | { type: "message:deleted"; messageId: string }
  | { type: "reaction:updated"; messageId: string; reactions: ReactionGroup[] }
  | { type: "room:updated"; room: RoomInfo }
  | { type: "member:joined"; room: RoomInfo; member: RoomMemberInfo }
  /** `left`: the member left on their own (emergency exit) instead of being removed. */
  | { type: "member:removed"; room: RoomInfo; userId: string; left?: boolean }
  | { type: "room:closed" }
  | { type: "room:deleted" }
  | { type: "typing"; userId: string; displayName: string; typing: boolean };

export interface MessagesPage {
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface OwnedRoomSummary {
  roomCode: string;
  name: string;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
  lastActivityAt: string;
  memberNames: string[];
  messageCount: number;
  lastMessage: string | null;
}
