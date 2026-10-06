import { NextResponse } from "next/server";
import { AppError, errorResponse, Errors } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { createMessage, fileUrlForKey, requireMember } from "@/lib/server/rooms";
import { maxUploadBytes, planUpload, randomStoredName, verifyContent } from "@/lib/server/uploads";
import { getStorage } from "@/lib/storage";
import { idSchema } from "@/lib/validation";

export async function POST(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  let storedKey: string | null = null;
  try {
    const { roomCode } = await params;
    const { user, room } = await requireMember(roomCode);
    rateLimit(`upload:${user.id}`, 10, 60_000);

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > maxUploadBytes() + 1024 * 1024) {
      throw new AppError(413, "too_large", "This file is too large to upload.");
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw Errors.badRequest("Please choose a file to upload.");

    const caption = String(form?.get("caption") ?? "").replace(/\r\n/g, "\n").trim();
    if (caption.length > 4000) throw Errors.badRequest("Caption is too long (max 4000 characters).");
    const replyRaw = form?.get("replyToMessageId");
    const replyToMessageId = typeof replyRaw === "string" && idSchema.safeParse(replyRaw).success ? replyRaw : null;

    const data = Buffer.from(await file.arrayBuffer());
    const plan = planUpload(file.name, data.length);
    const mimeType = await verifyContent(plan, data, true);

    storedKey = `${room.id}/${randomStoredName(plan.ext)}`;
    await getStorage().put(storedKey, data, mimeType);

    const message = await createMessage({
      user,
      room,
      content: caption || null,
      replyToMessageId,
      file: {
        type: plan.category,
        name: plan.safeName,
        url: fileUrlForKey(storedKey),
        mimeType,
        size: data.length,
      },
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    if (storedKey) await getStorage().delete(storedKey).catch(() => {});
    return errorResponse(err);
  }
}
