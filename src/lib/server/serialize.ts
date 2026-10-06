import "server-only";
import type { ChatMessage, RoomInfo, RoomMemberInfo } from "@/lib/types";
import type { Prisma } from "@/generated/prisma/client";
import { roomChannel } from "./realtime";

export const messageInclude = {
  sender: { select: { id: true, displayName: true } },
  replyTo: {
    select: {
      id: true,
      type: true,
      content: true,
      fileName: true,
      deletedAt: true,
      sender: { select: { displayName: true } },
    },
  },
} satisfies Prisma.MessageInclude;

type MessageWithRelations = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

const TYPE_LABEL = { image: "Photo", video: "Video", document: "Document", text: "Message" } as const;

export function toChatMessage(m: MessageWithRelations): ChatMessage {
  const isDeleted = m.deletedAt !== null;
  const r = m.replyTo;
  return {
    id: m.id,
    type: m.type,
    content: isDeleted ? null : m.content,
    senderId: m.senderId,
    senderName: m.sender.displayName,
    createdAt: m.createdAt.toISOString(),
    isDeleted,
    file:
      !isDeleted && m.fileUrl && m.fileName && m.fileMimeType
        ? { name: m.fileName, url: m.fileUrl, mimeType: m.fileMimeType, size: m.fileSize ?? 0 }
        : null,
    replyTo: r
      ? {
          id: r.id,
          senderName: r.sender.displayName,
          type: r.type,
          isDeleted: r.deletedAt !== null,
          preview:
            r.deletedAt !== null
              ? "Message deleted"
              : r.content?.slice(0, 140) || (r.fileName ? `${TYPE_LABEL[r.type]}: ${r.fileName}` : TYPE_LABEL[r.type]),
        }
      : null,
  };
}

export const roomInclude = {
  members: {
    where: { removedAt: null },
    orderBy: { joinedAt: "asc" },
    include: { user: { select: { id: true, displayName: true } } },
  },
} satisfies Prisma.ChatRoomInclude;

export type RoomWithMembers = Prisma.ChatRoomGetPayload<{ include: typeof roomInclude }>;

export function toMemberInfo(member: RoomWithMembers["members"][number], ownerId: string): RoomMemberInfo {
  return {
    id: member.id,
    userId: member.userId,
    displayName: member.user.displayName,
    isOwner: member.userId === ownerId,
    joinedAt: member.joinedAt.toISOString(),
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
