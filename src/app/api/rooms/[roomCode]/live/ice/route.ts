import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireMember } from "@/lib/server/rooms";

type IceServer = { urls: string | string[]; username?: string; credential?: string };

const STUN: IceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

function asList(value: unknown): IceServer[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.filter((s): s is IceServer => !!s && typeof s === "object" && "urls" in s);
}

/**
 * ICE servers for live video. Without a TURN server, devices on different networks (mobile data,
 * strict routers) often can't connect. Configure one of:
 * - CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN (Cloudflare Realtime TURN, short-lived creds)
 * - METERED_TURN_URL (Metered.ca credentials URL incl. ?apiKey=...)
 * - ICE_SERVERS (static JSON RTCIceServer[])
 */
async function loadIceServers(): Promise<IceServer[]> {
  const { CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN, METERED_TURN_URL, ICE_SERVERS } = process.env;

  if (CLOUDFLARE_TURN_KEY_ID && CLOUDFLARE_TURN_API_TOKEN) {
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${CLOUDFLARE_TURN_KEY_ID}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${CLOUDFLARE_TURN_API_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: 6 * 60 * 60 }),
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        },
      );
      if (res.ok) {
        const list = asList(((await res.json()) as { iceServers?: unknown }).iceServers);
        if (list.length) return list;
      } else console.error("Cloudflare TURN credentials failed", res.status);
    } catch (err) {
      console.error("Cloudflare TURN credentials failed", err);
    }
  }

  if (METERED_TURN_URL) {
    try {
      const res = await fetch(METERED_TURN_URL, { signal: AbortSignal.timeout(5000), cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as unknown;
        const list = asList(Array.isArray(body) ? body : (body as { iceServers?: unknown })?.iceServers);
        if (list.length) return [...STUN, ...list];
      } else console.error("Metered TURN credentials failed", res.status);
    } catch (err) {
      console.error("Metered TURN credentials failed", err);
    }
  }

  if (ICE_SERVERS) {
    try {
      const list = asList(JSON.parse(ICE_SERVERS));
      if (list.length) return [...STUN, ...list];
    } catch {
      console.error("ICE_SERVERS is not valid JSON");
    }
  }

  return STUN;
}

export async function GET(_req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    const { user } = await requireMember(roomCode);
    rateLimit(`live-ice:${user.id}`, 20, 60_000);
    const iceServers = await loadIceServers();
    return NextResponse.json(
      { iceServers, hasTurn: iceServers.some((s) => [s.urls].flat().some((u) => u.startsWith("turn"))) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
