import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { addMember, requireMember } from "@/lib/server/rooms";
import { displayNameSchema, firstIssue, idSchema } from "@/lib/validation";

/** Owner adds the second member: { displayName } for a new person, or { userId } for a past contact. */
export async function POST(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    const { user } = await requireMember(roomCode, { ownerOnly: true });
    rateLimit(`add-member:${user.id}`, 10, 60_000);
    const body = (await req.json().catch(() => null)) as { displayName?: unknown; userId?: unknown } | null;

    if (typeof body?.userId === "string") {
      if (!idSchema.safeParse(body.userId).success) throw Errors.badRequest("Invalid person.");
      return NextResponse.json(await addMember(roomCode, { userId: body.userId }), { status: 201 });
    }
    const name = displayNameSchema.safeParse(body?.displayName ?? "");
    if (!name.success) throw Errors.badRequest(firstIssue(name.error));
    return NextResponse.json(await addMember(roomCode, { displayName: name.data }), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
