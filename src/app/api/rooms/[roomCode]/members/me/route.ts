import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { renameRoomMember, requireMember } from "@/lib/server/rooms";
import { firstIssue, memberDisplayNameSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    const { user } = await requireMember(roomCode);
    rateLimit(`member-name:${user.id}`, 10, 60_000);
    const parsed = memberDisplayNameSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw Errors.badRequest(firstIssue(parsed.error));
    const room = await renameRoomMember(roomCode, parsed.data.displayName);
    return NextResponse.json({ room });
  } catch (err) {
    return errorResponse(err);
  }
}