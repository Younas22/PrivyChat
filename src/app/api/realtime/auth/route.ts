import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { ROOM_CHANNEL_PATTERN, signChannelAuth } from "@/lib/server/realtime";
import { requireMember } from "@/lib/server/rooms";

/** Pusher private-channel auth: only active members of an open room may subscribe. */
export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null);
    const socketId = String(form?.get("socket_id") ?? "");
    const channel = String(form?.get("channel_name") ?? "");
    const match = ROOM_CHANNEL_PATTERN.exec(channel);
    if (!/^\d+\.\d+$/.test(socketId) || !match) throw Errors.badRequest("Invalid subscription.");
    await requireMember(match[1]);
    return NextResponse.json({ auth: signChannelAuth(socketId, channel) });
  } catch (err) {
    return errorResponse(err);
  }
}
