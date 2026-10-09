import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { recordPresence, requireMember } from "@/lib/server/rooms";

export async function POST(_req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    const { user } = await requireMember(roomCode);
    rateLimit(`presence:${user.id}`, 20, 60_000);
    const lastSeenAt = await recordPresence(roomCode);
    return NextResponse.json({ lastSeenAt });
  } catch (err) {
    return errorResponse(err);
  }
}