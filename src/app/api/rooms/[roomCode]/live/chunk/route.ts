import { NextResponse } from "next/server";
import { AppError, errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { publish } from "@/lib/server/realtime";
import { requireMember } from "@/lib/server/rooms";
import { getStorage } from "@/lib/storage";

/**
 * Relay for live video when a direct WebRTC connection isn't possible (different networks, no TURN).
 * The recorder uploads short pieces of the recording; viewers fetch them in order and play them
 * with MediaSource. Pieces live under the room's storage prefix and are deleted when the
 * recording ends (or with the room).
 */

const MAX_CHUNK_BYTES = 3 * 1024 * 1024; // stays under the 4.5 MB serverless request limit
const SESSION = /^[A-Za-z0-9]{8,32}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MIME = /^video\/(webm|mp4)(;\s*codecs="?[A-Za-z0-9.,\s]+"?)?$/;

const chunkKey = (roomId: string, userId: string, session: string, seq?: number) =>
  `${roomId}/live/${userId}-${session}${seq === undefined ? "" : `/${seq}.bin`}`;

function readParams(req: Request) {
  const q = new URL(req.url).searchParams;
  const session = q.get("session") ?? "";
  const seq = Number(q.get("seq"));
  return { session, seq, from: q.get("from") ?? "", mime: q.get("mime") ?? "" };
}

/** Recorder uploads piece `seq`; everyone in the room is told it's ready. */
export async function POST(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    const { user, room, membership } = await requireMember(roomCode);
    rateLimit(`live-chunk:${user.id}`, 40, 60_000);
    const { session, seq, mime } = readParams(req);
    if (!SESSION.test(session) || !Number.isInteger(seq) || seq < 0 || seq > 10_000 || !MIME.test(mime)) {
      throw Errors.badRequest("Invalid live chunk.");
    }
    const data = Buffer.from(await req.arrayBuffer());
    if (data.length === 0 || data.length > MAX_CHUNK_BYTES) throw Errors.badRequest("Invalid live chunk size.");
    await getStorage().put(chunkKey(room.id, user.id, session, seq), data, "application/octet-stream");
    await publish(room, {
      type: "live",
      from: user.id,
      fromName: membership.displayName,
      to: null,
      sessionId: session,
      kind: "chunk",
      data: JSON.stringify({ seq, mime }),
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Viewer downloads piece `seq` of another member's live recording. */
export async function GET(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    const { user, room } = await requireMember(roomCode);
    rateLimit(`live-fetch:${user.id}`, 240, 60_000);
    const { session, seq, from } = readParams(req);
    if (!SESSION.test(session) || !ID.test(from) || !Number.isInteger(seq) || seq < 0) {
      throw Errors.badRequest("Invalid live chunk.");
    }
    if (!room.members.some((m) => m.userId === from)) throw Errors.badRequest("Unknown member.");
    const storage = getStorage();
    const key = chunkKey(room.id, from, session, seq);
    const size = await storage.size(key);
    if (size === null) throw new AppError(404, "chunk_not_found", "Not available yet.");
    return new Response(await storage.read(key), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Recorder deletes its own pieces once the recording has ended. */
export async function DELETE(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const { roomCode } = await params;
    const { user, room } = await requireMember(roomCode);
    const { session } = readParams(req);
    if (!SESSION.test(session)) throw Errors.badRequest("Invalid session.");
    await getStorage().deletePrefix(chunkKey(room.id, user.id, session));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
