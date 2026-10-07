import "server-only";
import { cookies } from "next/headers";
import { signToken, verifyToken } from "./signed";

const COOKIE = "talkroom_rooms_unlock";
const TTL_MS = 15 * 60 * 1000; // unlocked for 15 minutes after entering the code

/** For people whose My Rooms is locked by the admin: has this browser entered the code recently? */
export async function isRoomsUnlocked(userId: string) {
  return verifyToken("rooms-unlock", userId, (await cookies()).get(COOKIE)?.value);
}

export async function unlockRooms(userId: string) {
  (await cookies()).set(COOKIE, signToken("rooms-unlock", userId, TTL_MS), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}
