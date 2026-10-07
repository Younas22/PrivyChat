import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export const IDENTITY_COOKIE = "talkroom_uid";
const ONE_YEAR = 60 * 60 * 24 * 365;
const ID_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

/** Reads the anonymous browser identity from the httpOnly cookie. */
export async function readAnonymousId(): Promise<string | null> {
  const value = (await cookies()).get(IDENTITY_COOKIE)?.value;
  return value && ID_PATTERN.test(value) ? value : null;
}

/** People the owner adds get a placeholder identity until they first use their access code. */
export const INVITE_PREFIX = "invite_";
export const isPendingInvite = (anonymousId: string) => anonymousId.startsWith(INVITE_PREFIX);

export function newAnonymousId() {
  return randomBytes(24).toString("base64url");
}

export async function setIdentityCookie(id: string) {
  (await cookies()).set(IDENTITY_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

/** Returns the existing anonymous ID or issues a new one. Only callable from Server Actions / Route Handlers. */
export async function ensureAnonymousId(): Promise<string> {
  const existing = await readAnonymousId();
  if (existing) return existing;
  const id = newAnonymousId();
  await setIdentityCookie(id);
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

// ---------- Access codes (open your chats in another browser) ----------

// Crockford base32: no I, L, O, U, so codes are easy to read and type.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 16; // 16 × 5 bits = 80 bits of randomness

function randomCode() {
  let code = "";
  for (const byte of randomBytes(CODE_LENGTH)) code += CODE_ALPHABET[byte & 31];
  return code;
}

/** "K7QM2XPA9DFRH3TN" → "K7QM-2XPA-9DFR-H3TN" */
export function formatAccessCode(code: string) {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/** Accepts what people type: any case, spaces/dashes, and O/I/L typed for 0/1. */
export function normalizeAccessCode(input: string) {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(cleaned) ? cleaned : null;
}

async function assignNewCode(userId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { accessCode: randomCode() } });
      return updated.accessCode!;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // collision
      throw err;
    }
  }
  throw new Error("Could not allocate an access code");
}

/** The user's access code, created the first time it's needed. Returned formatted. */
export async function getAccessCode(user: { id: string; accessCode: string | null }) {
  return formatAccessCode(user.accessCode ?? (await assignNewCode(user.id)));
}

/** Replaces the user's code (the old one stops working). Returned formatted. */
export async function regenerateAccessCode(userId: string) {
  return formatAccessCode(await assignNewCode(userId));
}

/** The user who owns an access code, or null. */
export async function findUserByAccessCode(input: string) {
  const code = normalizeAccessCode(input);
  if (!code) return null;
  return prisma.user.findUnique({ where: { accessCode: code } });
}
