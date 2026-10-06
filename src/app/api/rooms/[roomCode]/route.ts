import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { deleteRoom, renameRoom, requireMember } from "@/lib/server/rooms";
import { toRoomInfo } from "@/lib/server/serialize";
import { firstIssue, renameSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ roomCode: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { roomCode } = await params;
    const { room, user, isOwner } = await requireMember(roomCode);
    return NextResponse.json({
      room: toRoomInfo(room),
      viewer: { userId: user.id, displayName: user.displayName, isOwner },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { roomCode } = await params;
    const { user } = await requireMember(roomCode, { ownerOnly: true });
    rateLimit(`rename:${user.id}`, 10, 60_000);
    const parsed = renameSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw Errors.badRequest(firstIssue(parsed.error));
    const room = await renameRoom(roomCode, parsed.data.name);
    return NextResponse.json({ room });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { roomCode } = await params;
    await deleteRoom(roomCode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
