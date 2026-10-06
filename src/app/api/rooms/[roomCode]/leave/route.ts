import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/errors";
import { leaveRoom } from "@/lib/server/rooms";

/** Emergency exit: the caller (a member, not the owner) leaves the room. */
export async function POST(_req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    await leaveRoom(roomCode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
