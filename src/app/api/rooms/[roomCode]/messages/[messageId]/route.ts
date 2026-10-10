import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { deleteMessage, editMessage, requireMember } from "@/lib/server/rooms";
import { editMessageSchema, firstIssue, idSchema } from "@/lib/validation";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ roomCode: string; messageId: string }> },
) {
  try {
    const { roomCode, messageId } = await params;
    const { user } = await requireMember(roomCode);
    if (!idSchema.safeParse(messageId).success) throw Errors.badRequest("Invalid message.");
    rateLimit(`edit-message:${user.id}`, 20, 10_000);
    const parsed = editMessageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw Errors.badRequest(firstIssue(parsed.error));
    const message = await editMessage(roomCode, messageId, parsed.data.content);
    return NextResponse.json({ message });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roomCode: string; messageId: string }> },
) {
  try {
    const { roomCode, messageId } = await params;
    if (!idSchema.safeParse(messageId).success) throw Errors.badRequest("Invalid message.");
    await deleteMessage(roomCode, messageId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
