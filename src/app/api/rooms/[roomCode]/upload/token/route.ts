import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireMember } from "@/lib/server/rooms";
import { allowedContentTypes, maxSizeFor, planUpload, STORED_NAME_PATTERN } from "@/lib/server/uploads";

/**
 * Issues a short-lived token so the browser can upload one file straight to Vercel Blob.
 * The token is locked to one pathname inside this room, the file's content types and size.
 */
export async function POST(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw Errors.badRequest("Direct uploads are not enabled.");
    const { roomCode } = await params;
    const body = (await req.json()) as HandleUploadBody;

    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { user, room } = await requireMember(roomCode);
        rateLimit(`upload:${user.id}`, 10, 60_000);

        const payload = JSON.parse(clientPayload ?? "{}") as { name?: unknown; size?: unknown };
        const plan = planUpload(String(payload.name ?? ""), Number(payload.size ?? 0));
        const [prefix, storedName, ...rest] = pathname.split("/");
        const match = STORED_NAME_PATTERN.exec(storedName ?? "");
        if (prefix !== room.id || rest.length || !match || match[1] !== plan.ext) {
          throw Errors.badRequest("Invalid upload path.");
        }
        return {
          allowedContentTypes: allowedContentTypes(plan),
          maximumSizeInBytes: maxSizeFor(plan.category),
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60_000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
