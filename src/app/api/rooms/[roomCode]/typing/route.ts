import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { publish } from "@/lib/server/realtime";
import { requireMember } from "@/lib/server/rooms";

/** Broadcasts a "typing…" hint to the room. Nothing is stored. */
export async function POST(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    const { user, room } = await requireMember(roomCode);
    rateLimit(`typing:${user.id}`, 20, 10_000);
    const body = (await req.json().catch(() => null)) as { typing?: unknown } | null;
    if (typeof body?.typing !== "boolean") throw Errors.badRequest("Invalid typing state.");
    await publish(room, { type: "typing", userId: user.id, displayName: user.displayName, typing: body.typing });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
