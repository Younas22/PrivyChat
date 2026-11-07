"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveKind, LiveSignal } from "@/lib/types";

const CHUNK = 5000; // realtime payloads must stay under ~9 KB
const HEARTBEAT_MS = 6000;
const STALE_MS = 20_000;
const REWATCH_MS = 12_000;
const ICE_WAIT_MS = 5000;
const MAX_RETRIES = 3;
const ICE_CACHE_MS = 10 * 60 * 1000;

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

const rid = () =>
  Array.from({ length: 16 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");

/** Gathers ICE candidates into the local description so no separate candidate messages are needed. */
function waitForIce(pc: RTCPeerConnection) {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, ICE_WAIT_MS);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/** Counts candidate types in an SDP (host / srflx / relay), for diagnosing failed connections. */
function candidateTypes(sdp: string | undefined) {
  const counts: Record<string, number> = {};
  for (const m of (sdp ?? "").matchAll(/ typ (\w+)/g)) counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  return counts;
}

/** A description plus the negotiation it belongs to, so a stale answer never lands on a newer offer. */
type Signed = { id: string; sdp: RTCSessionDescriptionInit };

export interface LiveWatch {
  sessionId: string;
  from: string;
  fromName: string;
  stream: MediaStream | null;
  status: "connecting" | "live" | "failed";
}

type Peer = { pc: RTCPeerConnection; offerId: string };

type Broadcast = {
  sessionId: string;
  stream: MediaStream;
  peers: Map<string, Peer>;
  timer: ReturnType<typeof setInterval>;
};

type Viewing = {
  sessionId: string;
  from: string;
  fromName: string;
  pc: RTCPeerConnection | null;
  lastSeen: number;
  lastWatch: number;
  retries: number;
};

/**
 * Live video for recordings: the recorder streams its camera over WebRTC to every other member
 * who is watching. Signaling (offer/answer) travels through the room's realtime channel.
 */
export function useLiveVideo(base: string, selfId: string) {
  const [viewerCount, setViewerCount] = useState(0);
  const [watch, setWatch] = useState<LiveWatch | null>(null);
  const broadcast = useRef<Broadcast | null>(null);
  const viewing = useRef<Viewing | null>(null);
  const dismissed = useRef(new Set<string>());
  const chunks = useRef(new Map<string, { parts: string[]; got: number; at: number }>());
  const ice = useRef<{ servers: RTCIceServer[]; at: number; pending: Promise<RTCIceServer[]> | null }>({
    servers: FALLBACK_ICE,
    at: 0,
    pending: null,
  });

  // ---------- ICE servers (STUN + TURN from the server) ----------

  const getIceServers = useCallback(async () => {
    const cache = ice.current;
    if (cache.at && Date.now() - cache.at < ICE_CACHE_MS) return cache.servers;
    cache.pending ??= fetch(`${base}/live/ice`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ iceServers: RTCIceServer[]; hasTurn: boolean }>) : null))
      .then((body) => {
        if (body?.iceServers?.length) {
          cache.servers = body.iceServers;
          cache.at = Date.now();
          if (!body.hasTurn) console.info("[live video] No TURN server configured: viewers on other networks may not connect.");
        }
        return cache.servers;
      })
      .catch(() => cache.servers)
      .finally(() => {
        cache.pending = null;
      });
    return cache.pending;
  }, [base]);

  // ---------- transport ----------

  const send = useCallback(
    (sessionId: string, kind: LiveKind, to: string | null, data?: string) => {
      const post = (body: object) =>
        fetch(`${base}/live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: kind === "end" || kind === "leave",
        }).catch(() => {});
      if (!data || data.length <= CHUNK) return void post({ sessionId, kind, to, data });
      const msgId = rid();
      const parts = Math.ceil(data.length / CHUNK);
      for (let i = 0; i < parts; i++) {
        void post({ sessionId, kind, to, data: data.slice(i * CHUNK, (i + 1) * CHUNK), msgId, part: i, parts });
      }
    },
    [base],
  );

  /** Returns the full payload once every part has arrived (parts may arrive out of order). */
  const assemble = (e: LiveSignal): string | null => {
    if (!e.msgId || !e.parts || e.parts === 1) return e.data ?? "";
    const now = Date.now();
    for (const [k, v] of chunks.current) if (now - v.at > 30_000) chunks.current.delete(k);
    const key = `${e.from}:${e.msgId}`;
    const entry = chunks.current.get(key) ?? { parts: new Array<string>(e.parts).fill(""), got: 0, at: now };
    if (e.part === undefined || e.part >= entry.parts.length || entry.parts[e.part]) return null;
    entry.parts[e.part] = e.data ?? "";
    entry.got++;
    chunks.current.set(key, entry);
    if (entry.got < entry.parts.length) return null;
    chunks.current.delete(key);
    return entry.parts.join("");
  };

  const parseSigned = (raw: string | null): Signed | null => {
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as Signed;
      return typeof v?.id === "string" && v.sdp?.type && typeof v.sdp.sdp === "string" ? v : null;
    } catch {
      return null;
    }
  };

  // ---------- broadcaster ----------

  const countViewers = useCallback(() => {
    const b = broadcast.current;
    setViewerCount(b ? [...b.peers.values()].filter((p) => p.pc.connectionState === "connected").length : 0);
  }, []);

  const stopBroadcast = useCallback(() => {
    const b = broadcast.current;
    if (!b) return;
    broadcast.current = null;
    clearInterval(b.timer);
    b.peers.forEach((p) => p.pc.close());
    send(b.sessionId, "end", null);
    setViewerCount(0);
  }, [send]);

  const startBroadcast = useCallback(
    (stream: MediaStream) => {
      stopBroadcast();
      if (typeof RTCPeerConnection === "undefined") return;
      const sessionId = rid();
      const timer = setInterval(() => send(sessionId, "start", null), HEARTBEAT_MS);
      broadcast.current = { sessionId, stream, peers: new Map(), timer };
      void getIceServers(); // warm the cache before the first viewer asks
      send(sessionId, "start", null);
    },
    [send, stopBroadcast, getIceServers],
  );

  const offerTo = async (viewerId: string) => {
    const b = broadcast.current;
    if (!b) return;
    const servers = await getIceServers();
    if (broadcast.current !== b) return;
    b.peers.get(viewerId)?.pc.close();
    const pc = new RTCPeerConnection({ iceServers: servers });
    const peer: Peer = { pc, offerId: rid() };
    b.peers.set(viewerId, peer);
    b.stream.getTracks().forEach((track) => pc.addTrack(track, b.stream));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        console.warn("[live video] connection to viewer failed", {
          local: candidateTypes(pc.localDescription?.sdp),
          remote: candidateTypes(pc.remoteDescription?.sdp),
        });
      }
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        if (b.peers.get(viewerId) === peer) b.peers.delete(viewerId);
        pc.close();
      }
      countViewers();
    };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await waitForIce(pc);
      if (broadcast.current !== b || b.peers.get(viewerId) !== peer || !pc.localDescription) return;
      const signed: Signed = { id: peer.offerId, sdp: pc.localDescription.toJSON() };
      send(b.sessionId, "offer", viewerId, JSON.stringify(signed));
    } catch (err) {
      console.warn("[live video] couldn't create offer", err);
      pc.close();
      if (b.peers.get(viewerId) === peer) b.peers.delete(viewerId);
    }
  };

  // ---------- viewer ----------

  const stopViewing = useCallback(() => {
    viewing.current?.pc?.close();
    viewing.current = null;
    setWatch(null);
  }, []);

  const requestWatch = (v: Viewing) => {
    v.lastWatch = Date.now();
    send(v.sessionId, "watch", v.from);
  };

  const setStatus = (v: Viewing, status: LiveWatch["status"]) =>
    setWatch((w) => (w && w.sessionId === v.sessionId ? { ...w, status } : w));

  /** A failed attempt asks the recorder for a fresh offer a few times before giving up. */
  const retryOrFail = (v: Viewing, pc: RTCPeerConnection) => {
    if (viewing.current !== v || v.pc !== pc) return;
    pc.close();
    v.pc = null;
    if (v.retries < MAX_RETRIES) {
      v.retries++;
      setStatus(v, "connecting");
      requestWatch(v);
    } else {
      setStatus(v, "failed");
    }
  };

  const answerOffer = async (v: Viewing, offer: Signed) => {
    v.pc?.close();
    const servers = await getIceServers();
    if (viewing.current !== v) return;
    const pc = new RTCPeerConnection({ iceServers: servers });
    v.pc = pc;
    const remote = new MediaStream();
    pc.ontrack = (e) => {
      remote.addTrack(e.track);
      if (viewing.current === v && v.pc === pc) {
        setWatch((w) => (w && w.sessionId === v.sessionId ? { ...w, stream: remote } : w));
      }
    };
    pc.onconnectionstatechange = () => {
      if (viewing.current !== v || v.pc !== pc) return;
      const state = pc.connectionState;
      if (state === "connected") {
        v.retries = 0;
        setStatus(v, "live");
      } else if (state === "failed") {
        console.warn("[live video] connection failed", {
          local: candidateTypes(pc.localDescription?.sdp),
          remote: candidateTypes(pc.remoteDescription?.sdp),
          hint: "Only host/srflx candidates and no relay? Configure a TURN server (see .env.example).",
        });
        retryOrFail(v, pc);
      }
    };
    try {
      await pc.setRemoteDescription(offer.sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      await waitForIce(pc);
      if (viewing.current !== v || v.pc !== pc || !pc.localDescription) return;
      const signed: Signed = { id: offer.id, sdp: pc.localDescription.toJSON() };
      send(v.sessionId, "answer", v.from, JSON.stringify(signed));
    } catch (err) {
      console.warn("[live video] couldn't answer offer", err);
      retryOrFail(v, pc);
    }
  };

  /** Viewer closed the live window: stop receiving this session. */
  const closeWatch = useCallback(() => {
    const v = viewing.current;
    if (v) {
      dismissed.current.add(v.sessionId);
      send(v.sessionId, "leave", v.from);
    }
    stopViewing();
  }, [send, stopViewing]);

  // ---------- incoming signals ----------

  const onSignal = (e: LiveSignal) => {
    if (e.from === selfId || (e.to && e.to !== selfId)) return;
    if (typeof RTCPeerConnection === "undefined") return;
    const b = broadcast.current;
    const v = viewing.current;

    switch (e.kind) {
      case "watch":
        if (b && b.sessionId === e.sessionId) void offerTo(e.from);
        break;
      case "leave":
        if (b && b.sessionId === e.sessionId) {
          b.peers.get(e.from)?.pc.close();
          b.peers.delete(e.from);
          countViewers();
        }
        break;
      case "answer": {
        const peer = b && b.sessionId === e.sessionId ? b.peers.get(e.from) : undefined;
        const answer = parseSigned(assemble(e));
        if (!peer || !answer || answer.id !== peer.offerId) break; // stale answer for an older offer
        if (peer.pc.signalingState === "have-local-offer") {
          peer.pc.setRemoteDescription(answer.sdp).catch((err) => {
            console.warn("[live video] couldn't apply answer", err);
            peer.pc.close();
          });
        }
        break;
      }
      case "start": {
        if (dismissed.current.has(e.sessionId)) break;
        const now = Date.now();
        if (v && v.sessionId === e.sessionId) {
          v.lastSeen = now;
          const state = v.pc?.connectionState;
          const healthy = state === "connected" || state === "connecting" || state === "new";
          if ((!v.pc || !healthy) && now - v.lastWatch > REWATCH_MS) requestWatch(v);
          break;
        }
        v?.pc?.close();
        const next: Viewing = {
          sessionId: e.sessionId,
          from: e.from,
          fromName: e.fromName,
          pc: null,
          lastSeen: now,
          lastWatch: 0,
          retries: 0,
        };
        viewing.current = next;
        setWatch({ sessionId: e.sessionId, from: e.from, fromName: e.fromName, stream: null, status: "connecting" });
        void getIceServers();
        requestWatch(next);
        break;
      }
      case "offer": {
        if (!v || v.sessionId !== e.sessionId || v.from !== e.from) break;
        const offer = parseSigned(assemble(e));
        if (!offer) break;
        v.lastSeen = Date.now();
        void answerOffer(v, offer);
        break;
      }
      case "end":
        if (v && v.sessionId === e.sessionId) stopViewing();
        break;
    }
  };

  const handlerRef = useRef<(e: LiveSignal) => void>(() => {});
  useEffect(() => {
    handlerRef.current = onSignal;
  });
  const handleSignal = useCallback((e: LiveSignal) => handlerRef.current(e), []);

  // Drop a live view whose recorder vanished without saying goodbye (closed tab, lost network).
  useEffect(() => {
    const timer = setInterval(() => {
      const v = viewing.current;
      if (v && Date.now() - v.lastSeen > STALE_MS) stopViewing();
    }, 5000);
    return () => clearInterval(timer);
  }, [stopViewing]);

  useEffect(
    () => () => {
      stopBroadcast();
      viewing.current?.pc?.close();
      viewing.current = null;
    },
    [stopBroadcast],
  );

  return { handleSignal, startBroadcast, stopBroadcast, viewerCount, watch, closeWatch };
}

export type LiveVideo = ReturnType<typeof useLiveVideo>;
