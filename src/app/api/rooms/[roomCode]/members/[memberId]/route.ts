import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { removeMember } from "@/lib/server/rooms";
import { idSchema } from "@/lib/validation";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roomCode: string; memberId: string }> },
) {
  try {
    const { roomCode, memberId } = await params;
    if (!idSchema.safeParse(memberId).success) throw Errors.badRequest("Invalid member.");
    await removeMember(roomCode, memberId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
