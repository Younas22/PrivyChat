"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomEvent } from "@/lib/types";
import type { ConnectionState } from "./RoomPanel";

const POLL_MS = 4000;
const RECONNECT_MS = 5000;

interface Handlers {
  onEvent: (event: RoomEvent) => void;
  /** Full refresh from the server (after (re)connecting or while polling). */
  onResync: () => void;
}

/**
 * Subscribes to the room's Server-Sent Events stream.
 * Falls back to polling whenever the stream is unavailable.
 */
export function useRoomEvents(roomCode: string, enabled: boolean, handlers: Handlers): ConnectionState {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const startPolling = () => {
      setConnection("polling");
      if (!pollTimer) pollTimer = setInterval(() => ref.current.onResync(), POLL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    const connect = () => {
      if (disposed) return;
      if (typeof EventSource === "undefined") return startPolling();
      es = new EventSource(`/api/rooms/${encodeURIComponent(roomCode)}/events`);
      es.onopen = () => {
        stopPolling();
        setConnection("live");
        ref.current.onResync();
      };
      es.onmessage = (e) => {
        try {
          ref.current.onEvent(JSON.parse(e.data) as RoomEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      es.onerror = () => {
        startPolling();
        if (es?.readyState === EventSource.CLOSED) {
          // Server refused the stream (or it ended). Resync to learn why, then try again later.
          es.close();
          ref.current.onResync();
          retryTimer = setTimeout(connect, RECONNECT_MS);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      es?.close();
      stopPolling();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [roomCode, enabled]);

  return connection;
}
