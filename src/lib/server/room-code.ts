import "server-only";
import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 12 chars from a 57-symbol alphabet ≈ 70 bits of entropy, using rejection sampling to avoid bias. */
export function generateRoomCode(length = 12): string {
  let code = "";
  while (code.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 228 && code.length < length) code += ALPHABET[byte % ALPHABET.length];
    }
  }
  return code;
}

export const ROOM_CODE_PATTERN = /^[A-Za-z0-9]{6,32}$/;
