import "server-only";
import { createHash, createHmac } from "node:crypto";
import type { RoomEvent } from "@/lib/types";

type Listener = (event: RoomEvent) => void;
type RoomRef = { id: string; roomCode: string };

const globalForBus = globalThis as unknown as { roomBus?: Map<string, Set<Listener>> };
const channels = (globalForBus.roomBus ??= new Map<string, Set<Listener>>());

// ---------- Pusher (production / serverless) ----------

export function pusherConfig() {
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) return null;
  return { appId: PUSHER_APP_ID, key: PUSHER_KEY, secret: PUSHER_SECRET, cluster: PUSHER_CLUSTER };
}

export const roomChannel = (roomCode: string) => `private-room-${roomCode}`;
export const ROOM_CHANNEL_PATTERN = /^private-room-([A-Za-z0-9]{6,32})$/;

/** Signs a private-channel subscription (Pusher auth protocol). */
export function signChannelAuth(socketId: string, channel: string) {
  const cfg = pusherConfig();
  if (!cfg) throw new Error("Pusher is not configured");
  const signature = createHmac("sha256", cfg.secret).update(`${socketId}:${channel}`).digest("hex");
  return `${cfg.key}:${signature}`;
}

/**
 * Sends a content-free "sync" signal through Pusher's REST API.
 * Clients re-fetch through the permission-checked API, so no message data ever goes through Pusher.
 */
async function triggerPusher(roomCode: string, event: RoomEvent) {
  const cfg = pusherConfig();
  if (!cfg) return;
  const path = `/apps/${cfg.appId}/events`;
  const body = JSON.stringify({
    name: "sync",
    channels: [roomChannel(roomCode)],
    data: JSON.stringify({ type: event.type }),
  });
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

/** Broadcasts a room event to local SSE listeners and (when configured) Pusher. */
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
  // Awaited so serverless functions don't freeze before the request is sent.
  await triggerPusher(room.roomCode, event).catch((err) => console.error("Pusher trigger failed", err));
}
