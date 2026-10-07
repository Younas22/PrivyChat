import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { isPendingInvite } from "./identity";
import { publish } from "./realtime";
import { fileKeyFromUrl } from "./rooms";
import { messageInclude, roomInclude, toChatMessage, toRoomInfo } from "./serialize";
import { safeEqual, signToken, verifyToken } from "./signed";

const ADMIN_COOKIE = "talkroom_admin";
const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours

/** Admin login settings from the environment. Admin is disabled until ADMIN_PASSWORD is set. */
export function adminConfig() {
  const email = (process.env.ADMIN_EMAIL || "098765@oooo.co").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  return { email, password, enabled: password.length >= 8 };
}

/** Session subject includes a hash of the password, so changing it signs every admin out. */
function sessionSubject() {
  return `admin|${createHash("sha256").update(adminConfig().password).digest("hex")}`;
}

export function checkAdminCredentials(email: string, password: string) {
  const cfg = adminConfig();
  if (!cfg.enabled) return false;
  // Evaluate both so timing doesn't reveal which one was wrong.
  const okEmail = safeEqual(email.trim().toLowerCase(), cfg.email);
  const okPassword = safeEqual(password, cfg.password);
  return okEmail && okPassword;
}

export async function startAdminSession() {
  (await cookies()).set(ADMIN_COOKIE, signToken("admin", sessionSubject(), SESSION_MS), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export async function endAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

export async function isAdmin() {
  if (!adminConfig().enabled) return false;
  return verifyToken("admin", sessionSubject(), (await cookies()).get(ADMIN_COOKIE)?.value);
}

/** For admin pages/actions: anyone else is sent to the admin login. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

// ---------- Admin data ----------

export interface AdminUserRow {
  id: string;
  displayName: string;
  createdAt: string;
  lastActiveAt: string;
  ownedRooms: number;
  joinedRooms: number;
  messages: number;
  hasCode: boolean;
  invited: boolean;
  roomsLocked: boolean;
}

export async function listAllUsers(): Promise<AdminUserRow[]> {
  await requireAdmin();
  const [users, lastMessages, memberships] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { ownedRooms: true, messages: { where: { deletedAt: null } } } } },
    }),
    prisma.message.groupBy({ by: ["senderId"], _max: { createdAt: true } }),
    prisma.roomMember.groupBy({ by: ["userId"], where: { removedAt: null }, _count: { _all: true } }),
  ]);
  const lastBy = new Map(lastMessages.map((m) => [m.senderId, m._max.createdAt]));
  const memberBy = new Map(memberships.map((m) => [m.userId, m._count._all]));
  return users
    .map((u) => ({
      id: u.id,
      displayName: u.displayName,
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: (lastBy.get(u.id) ?? u.updatedAt).toISOString(),
      ownedRooms: u._count.ownedRooms,
      joinedRooms: Math.max(0, (memberBy.get(u.id) ?? 0) - u._count.ownedRooms),
      messages: u._count.messages,
      hasCode: !!u.accessCode,
      invited: isPendingInvite(u.anonymousId),
      roomsLocked: u.roomsLocked,
    }))
    .sort((a, b) => (a.lastActiveAt < b.lastActiveAt ? 1 : -1));
}

export async function getUserWithRooms(userId: string) {
  await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const rooms = await prisma.chatRoom.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    orderBy: { updatedAt: "desc" },
    include: { ...roomInclude, _count: { select: { messages: { where: { deletedAt: null } } } } },
  });
  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      createdAt: user.createdAt.toISOString(),
      roomsLocked: user.roomsLocked,
      invited: isPendingInvite(user.anonymousId),
    },
    rooms: rooms.map((r) => ({
      roomCode: r.roomCode,
      name: r.name,
      status: r.status,
      isOwner: r.ownerId === userId,
      members: r.members.map((m) => m.user.displayName),
      messages: r._count.messages,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

export async function setRoomsLocked(userId: string, locked: boolean) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { roomsLocked: locked } });
}

async function deleteRoomById(roomId: string) {
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, include: roomInclude });
  if (!room) return;
  await prisma.chatRoom.delete({ where: { id: roomId } }); // members/messages/reactions cascade
  await getStorage().deletePrefix(room.id).catch((err) => console.error("Failed to delete room files", err));
  await publish(room, { type: "room:deleted" });
}

export async function adminDeleteRoom(roomCode: string) {
  await requireAdmin();
  const room = await prisma.chatRoom.findUnique({ where: { roomCode }, select: { id: true } });
  if (room) await deleteRoomById(room.id);
}

/**
 * Deletes a person and everything that belongs to them: rooms they own (with all messages and
 * files), their messages and files in other people's rooms, and their memberships.
 */
export async function adminDeleteUser(userId: string) {
  await requireAdmin();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const owned = await prisma.chatRoom.findMany({ where: { ownerId: userId }, select: { id: true } });
  for (const r of owned) await deleteRoomById(r.id);

  // Their files in rooms they don't own.
  const files = await prisma.message.findMany({
    where: { senderId: userId, fileUrl: { not: null } },
    select: { fileUrl: true },
  });
  for (const f of files) {
    const key = f.fileUrl ? fileKeyFromUrl(f.fileUrl) : null;
    if (key) await getStorage().delete(key).catch(() => {});
  }

  // Rooms they were a member of: tell the other person after removal.
  const joined = await prisma.chatRoom.findMany({
    where: { members: { some: { userId } } },
    include: roomInclude,
  });
  await prisma.user.delete({ where: { id: userId } }); // memberships + messages cascade
  for (const before of joined) {
    const after = await prisma.chatRoom.findUnique({ where: { id: before.id }, include: roomInclude });
    if (after) await publish(before, { type: "room:updated", room: toRoomInfo(after) });
  }
}

/** Full transcript of a room for the admin (read-only). */
export async function adminTranscript(roomCode: string) {
  await requireAdmin();
  const room = await prisma.chatRoom.findUnique({ where: { roomCode }, include: roomInclude });
  if (!room) return null;
  const rows = await prisma.message.findMany({
    where: { roomId: room.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: messageInclude,
  });
  return { room: toRoomInfo(room), messages: rows.map(toChatMessage) };
}
