import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { publish } from "@/lib/server/realtime";
import { requireMember } from "@/lib/server/rooms";

const Body = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9]{8,32}$/),
  kind: z.enum(["start", "end", "watch", "leave", "offer", "answer"]),
  to: z.string().min(1).max(64).nullish(),
  data: z.string().max(6000).optional(),
  msgId: z.string().regex(/^[A-Za-z0-9]{8,32}$/).optional(),
  part: z.number().int().min(0).max(19).optional(),
  parts: z.number().int().min(1).max(20).optional(),
});

/** Relays WebRTC signaling for live video recordings to the room. Nothing is stored. */
export async function POST(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    const { user, room, membership } = await requireMember(roomCode);
    rateLimit(`live:${user.id}`, 60, 10_000);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw Errors.badRequest("Invalid live signal.");
    const { to, ...rest } = parsed.data;
    if (to && !room.members.some((m) => m.userId === to)) throw Errors.badRequest("Unknown member.");
    await publish(room, { type: "live", from: user.id, fromName: membership.displayName, to: to ?? null, ...rest });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
