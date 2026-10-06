import "server-only";
import type { RoomEvent } from "@/lib/types";

type Listener = (event: RoomEvent) => void;

const globalForBus = globalThis as unknown as { roomBus?: Map<string, Set<Listener>> };
const channels = (globalForBus.roomBus ??= new Map());

/**
 * In-process pub/sub that feeds the Server-Sent Events stream.
 * Works for a single Node process; replace with Redis pub/sub to scale horizontally.
 */
export function subscribe(roomId: string, listener: Listener) {
  let set = channels.get(roomId);
  if (!set) channels.set(roomId, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) channels.delete(roomId);
  };
}

export function publish(roomId: string, event: RoomEvent) {
  const set = channels.get(roomId);
  if (!set) return;
  for (const listener of [...set]) {
    try {
      listener(event);
    } catch (err) {
      console.error("realtime listener failed", err);
    }
  }
}
