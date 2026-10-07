import "server-only";
import { createHash, createHmac } from "node:crypto";
import { after } from "next/server";
import type { RoomEvent } from "@/lib/types";

type Listener = (event: RoomEvent) => void;

/** A room plus the members currently subscribed to its live channel. */
export type RoomRef = {
  id: string;
  roomCode: string;
  members: { userId: string; user: { anonymousId: string } }[];
};

const globalForBus = globalThis as unknown as { roomBus?: Map<string, Set<Listener>> };
const channels = (globalForBus.roomBus ??= new Map<string, Set<Listener>>());

// Pusher rejects messages over 10 KB; bigger events are sent as a "sync" signal instead.
const MAX_PUSHER_PAYLOAD = 9000;

// ---------- Pusher (production / serverless) ----------

export function pusherConfig() {
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) return null;
  return { appId: PUSHER_APP_ID, key: PUSHER_KEY, secret: PUSHER_SECRET, cluster: PUSHER_CLUSTER };
}

export const ROOM_CHANNEL_PATTERN = /^private-room-([A-Za-z0-9]{6,32})-([a-f0-9]{20})$/;

/**
 * Private channel name for a room's CURRENT members and the browsers they use. It changes when
 * someone is removed, joins, or moves to another device with their access code, so a removed
 * member or a signed-out device can't be authorized for the new channel and stops receiving.
 */
export function roomChannel(room: RoomRef): string | null {
  const cfg = pusherConfig();
  if (!cfg) return null;
  const memberSet = room.members
    .map((m) => `${m.userId}:${m.user.anonymousId}`)
    .sort()
    .join(",");
  const token = createHmac("sha256", cfg.secret).update(`${room.id}:${memberSet}`).digest("hex").slice(0, 20);
  return `private-room-${room.roomCode}-${token}`;
}

/** Signs a private-channel subscription (Pusher auth protocol). */
export function signChannelAuth(socketId: string, channel: string) {
  const cfg = pusherConfig();
  if (!cfg) throw new Error("Pusher is not configured");
  const signature = createHmac("sha256", cfg.secret).update(`${socketId}:${channel}`).digest("hex");
  return `${cfg.key}:${signature}`;
}

/** Sends one event through Pusher's REST API. */
async function triggerPusher(channel: string, name: string, data: string) {
  const cfg = pusherConfig();
  if (!cfg) return;
  const path = `/apps/${cfg.appId}/events`;
  const body = JSON.stringify({ name, channels: [channel], data });
  const params = new URLSearchParams({
    auth_key: cfg.key,
    auth_timestamp: String(Math.floor(Date.now() / 1000)),
    auth_version: "1.0",
    body_md5: createHash("md5").update(body).digest("hex"),
  });
  params.sort();
  const signature = createHmac("sha256", cfg.secret).update(`POST\n${path}\n${params.toString()}`).digest("hex");
  params.set("auth_signature", signature);

  const res = await fetch(`https://api-${cfg.cluster}.pusher.com${path}?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    // Never let a slow Pusher response hold a request (or a serverless function) open.
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) console.error("Pusher trigger failed", res.status, await res.text().catch(() => ""));
}

// ---------- In-process bus (local single-server SSE) ----------

export function subscribe(roomId: string, listener: Listener) {
  let set = channels.get(roomId);
  if (!set) channels.set(roomId, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) channels.delete(roomId);
  };
}

/**
 * Broadcasts a room event to local SSE listeners and (when configured) Pusher.
 * `room.members` must be the member set whose clients should receive it (e.g. BEFORE a removal).
 */
export async function publish(room: RoomRef, event: RoomEvent) {
  const set = channels.get(room.id);
  if (set) {
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch (err) {
        console.error("realtime listener failed", err);
      }
    }
  }

  const channel = roomChannel(room);
  if (!channel) return;
  const payload = JSON.stringify(event);
  const [name, data] =
    Buffer.byteLength(payload) <= MAX_PUSHER_PAYLOAD ? ["event", payload] : ["sync", JSON.stringify({ type: event.type })];
  const task = () => triggerPusher(channel, name, data).catch((err) => console.error("Pusher trigger failed", err));

  // Send after the response so the sender isn't kept waiting; Vercel keeps the function alive for it.
  try {
    after(task);
  } catch {
    await task(); // outside a request scope
  }
}
