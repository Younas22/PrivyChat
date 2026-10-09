import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { markMessagesRead, requireMember } from "@/lib/server/rooms";

export async function POST(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    const { user } = await requireMember(roomCode);
    rateLimit(`read:${user.id}`, 30, 10_000);
    const body = (await req.json().catch(() => null)) as { messageIds?: unknown } | null;
    if (!Array.isArray(body?.messageIds) || body.messageIds.length > 50 || !body.messageIds.every((id) => typeof id === "string")) {
      throw Errors.badRequest("Invalid message list.");
    }
    const result = await markMessagesRead(roomCode, body.messageIds);
    return NextResponse.json(result ?? { messageIds: [], readAt: null });
  } catch (err) {
    return errorResponse(err);
  }
}