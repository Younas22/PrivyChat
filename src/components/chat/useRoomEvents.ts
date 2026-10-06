"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeConfig, RoomEvent } from "@/lib/types";
import type { ConnectionState } from "./RoomPanel";

const POLL_MS = 4000;
const RECONNECT_MS = 5000;

interface Handlers {
  onEvent: (event: RoomEvent) => void;
  /** Full refresh from the server (after (re)connecting, on Pusher signals, or while polling). */
  onResync: () => void;
}

/**
 * Live room updates.
 * - Pusher (production): content-free "sync" signals trigger a refresh through the permission-checked API.
 * - SSE (local single server): full events from the in-process bus.
 * Falls back to polling whenever the live connection is down.
 */
export function useRoomEvents(
  roomCode: string,
  enabled: boolean,
  realtime: RealtimeConfig,
  handlers: Handlers,
): ConnectionState {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  const pusherKey = realtime.provider === "pusher" ? realtime.key : null;
  const pusherCluster = realtime.provider === "pusher" ? realtime.cluster : null;

  useEffect(() => {
    if (!enabled) return;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let teardown = () => {};

    const startPolling = () => {
      setConnection("polling");
      if (!pollTimer) pollTimer = setInterval(() => ref.current.onResync(), POLL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };
    const goLive = () => {
      stopPolling();
      setConnection("live");
      ref.current.onResync();
    };
    // Coalesce bursts of signals into one refresh.
    const scheduleResync = () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => ref.current.onResync(), 120);
    };

    if (pusherKey && pusherCluster) {
      void import("pusher-js").then(({ default: Pusher }) => {
        if (disposed) return;
        const client = new Pusher(pusherKey, {
          cluster: pusherCluster,
          channelAuthorization: { endpoint: "/api/realtime/auth", transport: "ajax" },
        });
        const channel = client.subscribe(`private-room-${roomCode}`);
        channel.bind("pusher:subscription_succeeded", goLive);
        channel.bind("pusher:subscription_error", () => {
          startPolling();
          ref.current.onResync(); // learns why (closed / removed / deleted)
        });
        channel.bind("sync", scheduleResync);
        client.connection.bind("state_change", ({ current }: { current: string }) => {
          if (current === "connected" && channel.subscribed) goLive();
          else if (current !== "connected" && current !== "connecting") startPolling();
        });
        teardown = () => {
          channel.unbind_all();
          client.unsubscribe(channel.name);
          client.disconnect();
        };
      });
    } else {
      let es: EventSource | null = null;
      const connect = () => {
        if (disposed) return;
        if (typeof EventSource === "undefined") return startPolling();
        es = new EventSource(`/api/rooms/${encodeURIComponent(roomCode)}/events`);
        es.onopen = goLive;
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
      teardown = () => es?.close();
    }

    return () => {
      disposed = true;
      teardown();
      stopPolling();
      if (retryTimer) clearTimeout(retryTimer);
      if (syncTimer) clearTimeout(syncTimer);
    };
  }, [roomCode, enabled, pusherKey, pusherCluster]);

  return connection;
}
