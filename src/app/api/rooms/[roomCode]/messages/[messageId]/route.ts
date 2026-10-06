import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { deleteMessage } from "@/lib/server/rooms";
import { idSchema } from "@/lib/validation";

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
