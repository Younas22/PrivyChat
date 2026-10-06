import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { listMessages, requireMember, sendTextMessage } from "@/lib/server/rooms";
import { firstIssue, idSchema, sendMessageSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ roomCode: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { roomCode } = await params;
    const before = new URL(req.url).searchParams.get("before");
    if (before && !idSchema.safeParse(before).success) throw Errors.badRequest("Invalid cursor.");
    return NextResponse.json(await listMessages(roomCode, before));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { roomCode } = await params;
    const { user } = await requireMember(roomCode);
    rateLimit(`msg:${user.id}`, 30, 10_000);
    const parsed = sendMessageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw Errors.badRequest(firstIssue(parsed.error));
    const message = await sendTextMessage(roomCode, parsed.data.content, parsed.data.replyToMessageId);
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
