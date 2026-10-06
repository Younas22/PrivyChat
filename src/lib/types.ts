// Shared DTOs exchanged between server and client. Never include anonymousId here.

export type MessageType = "text" | "image" | "video" | "document";

export interface FileInfo {
  name: string;
  url: string;
  mimeType: string;
  size: number;
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
  | { type: "room:updated"; room: RoomInfo }
  | { type: "member:joined"; room: RoomInfo; member: RoomMemberInfo }
  | { type: "member:removed"; room: RoomInfo; userId: string }
  | { type: "room:closed" }
  | { type: "room:deleted" };

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
