import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-side secret for signing short-lived cookies. Uses APP_SECRET when set; otherwise derives
 * one from server-only settings so deployments work without extra configuration.
 */
function secret(scope: string) {
  const base =
    process.env.APP_SECRET ||
    createHash("sha256")
      .update(`${process.env.DATABASE_URL ?? ""}|${process.env.PUSHER_SECRET ?? ""}`)
      .digest("hex");
  return createHash("sha256").update(`${scope}|${base}`).digest();
}

/** "<expiresAtMs>.<hmac>" binding `subject` to an expiry. */
export function signToken(scope: string, subject: string, ttlMs: number) {
  const exp = Date.now() + ttlMs;
  const mac = createHmac("sha256", secret(scope)).update(`${subject}|${exp}`).digest("base64url");
  return `${exp}.${mac}`;
}

export function verifyToken(scope: string, subject: string, token: string | undefined | null) {
  if (!token) return false;
  const [expRaw, mac] = token.split(".");
  const exp = Number(expRaw);
  if (!mac || !Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = createHmac("sha256", secret(scope)).update(`${subject}|${exp}`).digest();
  const given = Buffer.from(mac, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Constant-time string comparison (for passwords/emails). */
export function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
