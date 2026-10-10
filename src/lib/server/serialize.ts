import "server-only";
import type { ChatMessage, ReactionGroup, RoomInfo, RoomMemberInfo } from "@/lib/types";
import type { Prisma } from "@/generated/prisma/client";
import { roomChannel } from "./realtime";
import { isPendingInvite } from "./identity";

export const messageInclude = {
  sender: { select: { id: true, displayName: true } },
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: "asc" } },
  replyTo: {
    select: {
      id: true,
      type: true,
      content: true,
      fileName: true,
      deletedAt: true,
      sender: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.MessageInclude;

type MessageWithRelations = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

const TYPE_LABEL = { image: "Photo", video: "Video", document: "Document", audio: "Voice message", text: "Message" } as const;

/** Groups reaction rows by emoji, keeping the order each emoji was first used. */
export function groupReactions(rows: { emoji: string; userId: string }[]): ReactionGroup[] {
  const groups = new Map<string, string[]>();
  for (const r of rows) groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r.userId]);
  return [...groups].map(([emoji, userIds]) => ({ emoji, userIds }));
}

export function toChatMessage(m: MessageWithRelations, memberNames?: Map<string, string>): ChatMessage {
  const isDeleted = m.deletedAt !== null;
  const r = m.replyTo;
  return {
    id: m.id,
    type: m.type,
    content: isDeleted ? null : m.content,
    senderId: m.senderId,
    senderName: memberNames?.get(m.senderId) ?? m.sender.displayName,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
    isEdited: m.editedAt !== null,
    isDeleted,
    file:
      !isDeleted && m.fileUrl && m.fileName && m.fileMimeType
        ? {
            name: m.fileName,
            url: m.fileUrl,
            mimeType: m.fileMimeType,
            size: m.fileSize ?? 0,
            durationMs: m.fileDuration,
            waveform: m.waveform,
          }
        : null,
    reactions: isDeleted ? [] : groupReactions(m.reactions),
    replyTo: r
      ? {
          id: r.id,
          senderId: r.sender.id,
          senderName: memberNames?.get(r.sender.id) ?? r.sender.displayName,
          type: r.type,
          isDeleted: r.deletedAt !== null,
          preview:
            r.deletedAt !== null
              ? "Message deleted"
              : r.content?.slice(0, 140) ||
                (r.fileName && r.type !== "audio" ? `${TYPE_LABEL[r.type]}: ${r.fileName}` : TYPE_LABEL[r.type]),
        }
      : null,
  };
}

export const roomInclude = {
  members: {
    where: { removedAt: null },
    orderBy: { joinedAt: "asc" },
    // anonymousId is server-only: it keys the live channel (see roomChannel) and is never serialized.
    include: { user: { select: { id: true, displayName: true, anonymousId: true } } },
  },
} satisfies Prisma.ChatRoomInclude;

export type RoomWithMembers = Prisma.ChatRoomGetPayload<{ include: typeof roomInclude }>;

export function toMemberInfo(member: RoomWithMembers["members"][number], ownerId: string): RoomMemberInfo {
  return {
    id: member.id,
    userId: member.userId,
    displayName: member.displayName,
    isOwner: member.userId === ownerId,
    joinedAt: member.joinedAt.toISOString(),
    lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
    pending: isPendingInvite(member.user.anonymousId),
  };
}

export function toRoomInfo(room: RoomWithMembers): RoomInfo {
  return {
    id: room.id,
    roomCode: room.roomCode,
    name: room.name,
    status: room.status,
    ownerId: room.ownerId,
    members: room.members.map((m) => toMemberInfo(m, room.ownerId)),
    createdAt: room.createdAt.toISOString(),
    closedAt: room.closedAt?.toISOString() ?? null,
    channel: roomChannel(room),
  };
}
