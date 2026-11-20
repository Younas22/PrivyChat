import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireMember } from "@/lib/server/rooms";
import { allowedContentTypes, planUpload, STORED_NAME_PATTERN } from "@/lib/server/uploads";
import { getStorage } from "@/lib/storage";
import { R2StorageDriver } from "@/lib/storage/r2";

const bodySchema = z.object({
  key: z.string().max(200),
  name: z.string().min(1).max(500),
  size: z.number().int().positive(),
  contentType: z.string().max(200),
});

/**
 * Issues a short-lived presigned URL so the browser can PUT one file straight to Cloudflare R2.
 * The URL is locked to one new key inside this room. Size and real content are verified
 * afterwards by /upload/complete, which deletes anything that doesn't pass.
 */
export async function POST(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  try {
    const storage = getStorage();
    if (!(storage instanceof R2StorageDriver)) throw Errors.badRequest("Direct uploads are not enabled.");
    const { roomCode } = await params;
    const { user, room } = await requireMember(roomCode);
    rateLimit(`upload:${user.id}`, 10, 60_000);

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw Errors.badRequest("Invalid upload.");
    const { key, name, size } = parsed.data;
    const plan = planUpload(name, size);

    const [prefix, storedName, ...rest] = key.split("/");
    const match = STORED_NAME_PATTERN.exec(storedName ?? "");
    if (prefix !== room.id || rest.length || !match || match[1] !== plan.ext) {
      throw Errors.badRequest("Invalid upload path.");
    }
    if ((await storage.size(key)) !== null) throw Errors.badRequest("Invalid upload path.");

    const allowed = allowedContentTypes(plan);
    const contentType = allowed.includes(parsed.data.contentType) ? parsed.data.contentType : "application/octet-stream";
    const url = await storage.uploadUrl(key, contentType);
    return NextResponse.json({ url, contentType });
  } catch (err) {
    return errorResponse(err);
  }
}
