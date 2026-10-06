import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const IDENTITY_COOKIE = "talkroom_uid";
const ONE_YEAR = 60 * 60 * 24 * 365;
const ID_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

/** Reads the anonymous browser identity from the httpOnly cookie. */
export async function readAnonymousId(): Promise<string | null> {
  const value = (await cookies()).get(IDENTITY_COOKIE)?.value;
  return value && ID_PATTERN.test(value) ? value : null;
}

/** Returns the existing anonymous ID or issues a new one. Only callable from Server Actions / Route Handlers. */
export async function ensureAnonymousId(): Promise<string> {
  const existing = await readAnonymousId();
  if (existing) return existing;
  const id = randomBytes(24).toString("base64url");
  (await cookies()).set(IDENTITY_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return id;
}

export async function getCurrentUser() {
  const anonymousId = await readAnonymousId();
  if (!anonymousId) return null;
  return prisma.user.findUnique({ where: { anonymousId } });
}

/** Creates the user for this browser (or updates the display name). */
export async function upsertCurrentUser(displayName: string) {
  const anonymousId = await ensureAnonymousId();
  return prisma.user.upsert({
    where: { anonymousId },
    create: { anonymousId, displayName },
    update: { displayName },
  });
}
