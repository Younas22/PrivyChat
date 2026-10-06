import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { REACTION_EMOJIS, type ChatMessage, type MessagesPage, type OwnedRoomSummary, type ReactionGroup } from "@/lib/types";
import { getStorage } from "@/lib/storage";
import { Errors } from "./errors";
import { getCurrentUser, upsertCurrentUser } from "./identity";
import { publish, type RoomRef } from "./realtime";
import { generateRoomCode, ROOM_CODE_PATTERN } from "./room-code";
import { groupReactions, messageInclude, roomInclude, toChatMessage, toMemberInfo, toRoomInfo } from "./serialize";

export const MAX_MEMBERS = 2;
export const MAX_MESSAGE_LENGTH = 4000;
const PAGE_SIZE = 50;

type User = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function findRoom(roomCode: string) {
  if (!ROOM_CODE_PATTERN.test(roomCode)) return null;
  return prisma.chatRoom.findUnique({ where: { roomCode }, include: roomInclude });
}

export type RoomAccess = Awaited<ReturnType<typeof resolveRoomAccess>>;

/** Decides what the current browser is allowed to see for a room. Used by the room page. */
export async function resolveRoomAccess(roomCode: string) {
  const [room, user] = await Promise.all([findRoom(roomCode), getCurrentUser()]);
  if (!room) return { state: "not_found" as const };

  if (room.status === "closed") {
    // A saved room stays readable for its owner only.
    if (user && room.ownerId === user.id) return { state: "saved" as const, room, user };
    return { state: "closed" as const };
  }
  if (user) {
    if (room.members.some((m) => m.userId === user.id)) return { state: "member" as const, room, user };
    const past = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: user.id } },
      select: { removedAt: true },
    });
    if (past?.removedAt) return { state: "removed" as const };
  }
  if (room.members.length >= MAX_MEMBERS) return { state: "full" as const };
  return { state: "can_join" as const, room, user };
}

/**
 * Server-side guard for every chat operation: the caller must be an active member
 * of an open room (and optionally its owner). IDs from the client are never trusted.
 * `ownerCanReadSaved` lets the owner read (never write) a saved/closed room.
 */
export async function requireMember(
  roomCode: string,
  opts: { ownerOnly?: boolean; ownerCanReadSaved?: boolean } = {},
) {
  // Independent lookups run in parallel: every database round trip adds latency.
  const [user, room] = await Promise.all([getCurrentUser(), findRoom(roomCode)]);
  if (!room) throw Errors.notFound();
  if (room.status === "closed" && !(opts.ownerCanReadSaved && user && room.ownerId === user.id)) {
    throw Errors.closed();
  }
  if (!user) throw Errors.noIdentity();

  // The room already includes its active members, so the happy path needs no extra query.
  const membership = room.members.find((m) => m.userId === user.id);
  if (!membership) {
    const past = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: user.id } },
      select: { removedAt: true },
    });
    throw past?.removedAt ? Errors.removed() : Errors.notMember();
  }

  const isOwner = room.ownerId === user.id;
  if (opts.ownerOnly && !isOwner) throw Errors.ownerOnly();
  return { user, room, membership, isOwner };
}

// ---------- Room lifecycle ----------

export async function createRoom(displayName: string, roomName?: string) {
  const user = await upsertCurrentUser(displayName);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.chatRoom.create({
        data: {
          roomCode: generateRoomCode(),
          name: roomName || `${displayName}'s room`,
          ownerId: user.id,
          members: { create: { userId: user.id } },
        },
      });
    } catch (err) {
      // Astronomically unlikely code collision: retry with a new code.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Could not allocate a room code");
}

export async function joinRoom(roomCode: string, displayName: string) {
  if (!ROOM_CODE_PATTERN.test(roomCode)) throw Errors.notFound();
  const user = await upsertCurrentUser(displayName);

  const result = await prisma.$transaction(
    async (tx) => {
      // Lock the room row FIRST so concurrent joins queue up here. With READ COMMITTED,
      // the member count below then sees rows committed by whoever held the lock before us.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ChatRoom WHERE roomCode = ${roomCode} FOR UPDATE`;
      if (locked.length === 0) throw Errors.notFound();
      const room = await tx.chatRoom.findUniqueOrThrow({ where: { id: locked[0].id } });
      if (room.status === "closed") throw Errors.closed();

      const existing = await tx.roomMember.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: user.id } },
      });
      if (existing?.removedAt) throw Errors.removed();
      if (existing) return { room, joined: false };

      const activeCount = await tx.roomMember.count({ where: { roomId: room.id, removedAt: null } });
      if (activeCount >= MAX_MEMBERS) throw Errors.full();

      await tx.roomMember.create({ data: { roomId: room.id, userId: user.id } });
      return { room, joined: true };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );

  if (result.joined) {
    const fresh = await prisma.chatRoom.findUniqueOrThrow({ where: { id: result.room.id }, include: roomInclude });
    const member = fresh.members.find((m) => m.userId === user.id)!;
    // Announce on the channel the EXISTING members are subscribed to; the event carries the new channel.
    const before = { ...fresh, members: fresh.members.filter((m) => m.userId !== user.id) };
    await publish(before, { type: "member:joined", room: toRoomInfo(fresh), member: toMemberInfo(member, fresh.ownerId) });
  }
  return result.room;
}

export async function renameRoom(roomCode: string, name: string) {
  const { room } = await requireMember(roomCode, { ownerOnly: true });
  const updated = await prisma.chatRoom.update({ where: { id: room.id }, data: { name }, include: roomInclude });
  const info = toRoomInfo(updated);
  await publish(room, { type: "room:updated", room: info });
  return info;
}

export async function closeRoom(roomCode: string) {
  const { room } = await requireMember(roomCode, { ownerOnly: true });
  // Conditional update: a closed room can never be reopened or closed twice.
  const { count } = await prisma.chatRoom.updateMany({
    where: { id: room.id, status: "open" },
    data: { status: "closed", closedAt: new Date() },
  });
  if (count === 0) throw Errors.closed();
  await publish(room, { type: "room:closed" });
}

export async function deleteRoom(roomCode: string) {
  const { room } = await requireMember(roomCode, { ownerOnly: true, ownerCanReadSaved: true });
  // Members and messages are removed by ON DELETE CASCADE.
  await prisma.chatRoom.delete({ where: { id: room.id } });
  try {
    await getStorage().deletePrefix(room.id);
  } catch (err) {
    console.error("Failed to delete room files", err);
  }
  await publish(room, { type: "room:deleted" });
}

export async function removeMember(roomCode: string, memberId: string) {
  const { room, user } = await requireMember(roomCode, { ownerOnly: true });
  const target = await prisma.roomMember.findFirst({ where: { id: memberId, roomId: room.id, removedAt: null } });
  if (!target) throw Errors.badRequest("That member is no longer in this room.");
  if (target.userId === user.id) throw Errors.badRequest("You can't remove yourself. Close or delete the room instead.");

  await prisma.roomMember.update({ where: { id: target.id }, data: { removedAt: new Date() } });
  const fresh = await prisma.chatRoom.findUniqueOrThrow({ where: { id: room.id }, include: roomInclude });
  await publish(room, { type: "member:removed", room: toRoomInfo(fresh), userId: target.userId });
}

// ---------- Messages ----------

export async function listMessages(roomCode: string, before?: string | null): Promise<MessagesPage> {
  const { room } = await requireMember(roomCode, { ownerCanReadSaved: true });
  return listRoomMessages(room.id, before);
}

/** Latest page of messages for a room the caller has ALREADY been authorized for. */
export async function listRoomMessages(roomId: string, before?: string | null): Promise<MessagesPage> {
  const room = { id: roomId };
  let cursorDate: Date | undefined;
  if (before) {
    const cursor = await prisma.message.findFirst({ where: { id: before, roomId: room.id }, select: { createdAt: true } });
    cursorDate = cursor?.createdAt;
  }
  const rows = await prisma.message.findMany({
    where: { roomId: room.id, ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    include: messageInclude,
  });
  const hasMore = rows.length > PAGE_SIZE;
  return { messages: rows.slice(0, PAGE_SIZE).reverse().map(toChatMessage), hasMore };
}

async function validateReplyTarget(roomId: string, replyToMessageId?: string | null) {
  if (!replyToMessageId) return null;
  const target = await prisma.message.findFirst({ where: { id: replyToMessageId, roomId } });
  if (!target) throw Errors.badRequest("The message you're replying to no longer exists.");
  return target.id;
}

interface NewMessageInput {
  user: User;
  room: RoomRef;
  content: string | null;
  replyToMessageId?: string | null;
  file?: {
    type: "image" | "video" | "document" | "audio";
    name: string;
    url: string;
    mimeType: string;
    size: number;
    durationMs?: number | null;
    waveform?: string | null;
  };
}

export async function createMessage(input: NewMessageInput): Promise<ChatMessage> {
  const replyTo = await validateReplyTarget(input.room.id, input.replyToMessageId);
  const message = await prisma.message.create({
    data: {
      roomId: input.room.id,
      senderId: input.user.id,
      content: input.content,
      type: input.file?.type ?? "text",
      replyToMessageId: replyTo,
      fileName: input.file?.name,
      fileUrl: input.file?.url,
      fileMimeType: input.file?.mimeType,
      fileSize: input.file?.size,
      fileDuration: input.file?.type === "audio" ? (input.file.durationMs ?? null) : null,
      waveform: input.file?.type === "audio" ? (input.file.waveform ?? null) : null,
    },
    include: messageInclude,
  });
  const dto = toChatMessage(message);
  await publish(input.room, { type: "message:new", message: dto });
  return dto;
}

export async function sendTextMessage(roomCode: string, content: string, replyToMessageId?: string | null) {
  const { user, room } = await requireMember(roomCode);
  return createMessage({ user, room, content, replyToMessageId });
}

export async function deleteMessage(roomCode: string, messageId: string) {
  const { user, room } = await requireMember(roomCode);
  const message = await prisma.message.findFirst({ where: { id: messageId, roomId: room.id } });
  if (!message || message.deletedAt) throw Errors.badRequest("This message was already deleted.");
  if (message.senderId !== user.id) throw Errors.badRequest("You can only delete your own messages.");

  await prisma.$transaction([
    prisma.message.update({
      where: { id: message.id },
      data: {
        deletedAt: new Date(),
        content: null,
        fileUrl: null,
        fileName: null,
        fileMimeType: null,
        fileSize: null,
        fileDuration: null,
        waveform: null,
      },
    }),
    prisma.messageReaction.deleteMany({ where: { messageId: message.id } }),
  ]);
  if (message.fileUrl) {
    const key = fileKeyFromUrl(message.fileUrl);
    if (key) await getStorage().delete(key).catch((err) => console.error("Failed to delete file", err));
  }
  await publish(room, { type: "message:deleted", messageId: message.id });
}

// ---------- Reactions ----------

/**
 * Sets the caller's reaction on a message. Each person has at most one reaction per message;
 * sending the same emoji again removes it. The caller must already be authorized (requireMember).
 */
export async function toggleReaction(
  { user, room }: { user: { id: string }; room: RoomRef },
  messageId: string,
  emoji: string,
): Promise<ReactionGroup[]> {
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) throw Errors.badRequest("Unsupported reaction.");
  const message = await prisma.message.findFirst({
    where: { id: messageId, roomId: room.id, deletedAt: null },
    select: { id: true },
  });
  if (!message) throw Errors.badRequest("This message is no longer available.");

  const where = { messageId_userId: { messageId: message.id, userId: user.id } };
  const existing = await prisma.messageReaction.findUnique({ where, select: { emoji: true } });
  if (existing?.emoji === emoji) {
    await prisma.messageReaction.delete({ where });
  } else {
    await prisma.messageReaction.upsert({
      where,
      create: { messageId: message.id, userId: user.id, emoji },
      update: { emoji, createdAt: new Date() },
    });
  }

  const rows = await prisma.messageReaction.findMany({
    where: { messageId: message.id },
    orderBy: { createdAt: "asc" },
    select: { emoji: true, userId: true },
  });
  const reactions = groupReactions(rows);
  await publish(room, { type: "reaction:updated", messageId: message.id, reactions });
  return reactions;
}

// ---------- Files ----------

export const FILE_ROUTE_PREFIX = "/api/files/";

export function fileUrlForKey(key: string) {
  return FILE_ROUTE_PREFIX + key;
}

export function fileKeyFromUrl(url: string) {
  return url.startsWith(FILE_ROUTE_PREFIX) ? url.slice(FILE_ROUTE_PREFIX.length) : null;
}

/** Files are only served to active members of the (open) room that owns them. */
export async function authorizeFileAccess(roomId: string) {
  const user = await getCurrentUser();
  if (!user) throw Errors.noIdentity();
  const membership = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } },
    include: { room: { select: { status: true, ownerId: true } } },
  });
  if (!membership) throw Errors.notMember();
  if (membership.removedAt) throw Errors.removed();
  if (membership.room.status === "closed" && membership.room.ownerId !== user.id) throw Errors.closed();
}

// ---------- My Rooms ----------

const TYPE_PREVIEW = { image: "📷 Photo", video: "🎬 Video", document: "📄 Document", audio: "🎤 Voice message", text: "" } as const;

/** Rooms created by the current browser's user, newest activity first. */
export async function listOwnedRooms(): Promise<OwnedRoomSummary[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rooms = await prisma.chatRoom.findMany({
    where: { ownerId: user.id },
    include: {
      members: { where: { removedAt: null }, include: { user: { select: { displayName: true } } } },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, type: true, createdAt: true },
      },
      _count: { select: { messages: { where: { deletedAt: null } } } },
    },
  });
  return rooms
    .map((r) => {
      const last = r.messages[0];
      return {
        roomCode: r.roomCode,
        name: r.name,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        closedAt: r.closedAt?.toISOString() ?? null,
        lastActivityAt: (r.closedAt ?? last?.createdAt ?? r.createdAt).toISOString(),
        memberNames: r.members.filter((m) => m.userId !== user.id).map((m) => m.user.displayName),
        messageCount: r._count.messages,
        lastMessage: last ? (last.content?.slice(0, 120) || TYPE_PREVIEW[last.type]) : null,
      };
    })
    .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
}
