"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { createRoom, joinRoom, moveToThisBrowser } from "@/lib/server/rooms";
import { getCurrentUser, normalizeAccessCode, regenerateAccessCode } from "@/lib/server/identity";
import { unlockRooms } from "@/lib/server/roomsLock";
import { safeEqual } from "@/lib/server/signed";
import { displayNameSchema, firstIssue, optionalRoomNameSchema } from "@/lib/validation";

export type FormState = { error?: string } | undefined;

async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

function friendly(err: unknown): FormState {
  if (err instanceof AppError) return { error: err.message };
  console.error("Room action failed:", err);
  return { error: "Something went wrong on our side. Please try again in a moment." };
}

export async function createRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = displayNameSchema.safeParse(formData.get("displayName") ?? "");
  if (!name.success) return { error: firstIssue(name.error) };
  const roomName = optionalRoomNameSchema.safeParse(formData.get("roomName") ?? "");
  if (!roomName.success) return { error: firstIssue(roomName.error) };

  let roomCode: string;
  try {
    rateLimit(`create:${await clientKey()}`, 10, 60_000);
    const room = await createRoom(name.data, roomName.data || undefined);
    roomCode = room.roomCode;
  } catch (err) {
    return friendly(err);
  }
  redirect(`/chat/${roomCode}`);
}

export async function joinRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = displayNameSchema.safeParse(formData.get("displayName") ?? "");
  if (!name.success) return { error: firstIssue(name.error) };
  const roomCode = String(formData.get("roomCode") ?? "");

  try {
    rateLimit(`join:${await clientKey()}`, 20, 60_000);
    await joinRoom(roomCode, name.data);
  } catch (err) {
    return friendly(err);
  }
  redirect(`/chat/${roomCode}`);
}

// ---------- Access codes ----------

const NEXT_PATTERN = /^\/chat\/[A-Za-z0-9]{6,32}$/;

/** Opens this browser as the person who owns the code, then shows their rooms (or the room link). */
export async function accessCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "");
  const next = String(formData.get("next") ?? "");
  try {
    // Codes are long and random; this stops anyone from guessing them by trying many.
    rateLimit(`code:${await clientKey()}`, 10, 10 * 60_000);
    if (!normalizeAccessCode(code)) return { error: "That doesn't look like an access code. It has 16 letters and numbers." };
    // Opens the chats here and signs out the person's other devices.
    const user = await moveToThisBrowser(code);
    if (!user) return { error: "No chats found for this code. Check it and try again." };
    await unlockRooms(user.id); // they just proved the code, so a locked My Rooms opens too
  } catch (err) {
    return friendly(err);
  }
  redirect(NEXT_PATTERN.test(next) ? next : "/rooms");
}

/** Replaces the current user's access code; the old one stops working. */
export async function regenerateCodeAction(): Promise<{ code?: string; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Open one of your chats first." };
    rateLimit(`newcode:${user.id}`, 5, 10 * 60_000);
    return { code: await regenerateAccessCode(user.id) };
  } catch (err) {
    return { error: friendly(err)?.error };
  }
}

/** Opens a locked My Rooms for 15 minutes after the person enters their own access code. */
export async function unlockRoomsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Open one of your chats first." };
    rateLimit(`unlock:${user.id}`, 8, 10 * 60_000);
    const code = normalizeAccessCode(String(formData.get("code") ?? ""));
    if (!code || !user.accessCode || !safeEqual(code, user.accessCode)) {
      return { error: "That's not your access code." };
    }
    await unlockRooms(user.id);
  } catch (err) {
    return friendly(err);
  }
  redirect("/rooms");
}
