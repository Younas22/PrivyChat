import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/errors";
import { closeRoom } from "@/lib/server/rooms";

export async function POST(_req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    await closeRoom(roomCode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
