"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { createRoom, joinRoom } from "@/lib/server/rooms";
import { displayNameSchema, firstIssue, optionalRoomNameSchema } from "@/lib/validation";

export type FormState = { error?: string } | undefined;

async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

function friendly(err: unknown): FormState {
  if (err instanceof AppError) return { error: err.message };
  console.error(err);
  return { error: "We couldn't reach the server. Please try again." };
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
