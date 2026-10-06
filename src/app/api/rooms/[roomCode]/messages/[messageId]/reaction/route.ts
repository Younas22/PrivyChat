import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireMember, toggleReaction } from "@/lib/server/rooms";
import { idSchema } from "@/lib/validation";

/** Toggle the caller's emoji reaction on a message. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ roomCode: string; messageId: string }> },
) {
  try {
    const { roomCode, messageId } = await params;
    if (!idSchema.safeParse(messageId).success) throw Errors.badRequest("Invalid message.");
    const access = await requireMember(roomCode);
    rateLimit(`react:${access.user.id}`, 30, 10_000);
    const body = (await req.json().catch(() => null)) as { emoji?: unknown } | null;
    if (typeof body?.emoji !== "string") throw Errors.badRequest("Choose a reaction.");
    const reactions = await toggleReaction(access, messageId, body.emoji);
    return NextResponse.json({ reactions });
  } catch (err) {
    return errorResponse(err);
  }
}
