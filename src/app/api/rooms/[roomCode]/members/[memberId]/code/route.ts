import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { pendingMemberCode } from "@/lib/server/rooms";
import { idSchema } from "@/lib/validation";

/** Owner re-reads the code of a member they added, until that member first uses it. */
export async function GET(_req: Request, { params }: { params: Promise<{ roomCode: string; memberId: string }> }) {
  try {
    const { roomCode, memberId } = await params;
    if (!idSchema.safeParse(memberId).success) throw Errors.badRequest("Invalid member.");
    return NextResponse.json({ code: await pendingMemberCode(roomCode, memberId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
