import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse, Errors } from "@/lib/server/errors";
import { createMessage, fileUrlForKey, requireMember } from "@/lib/server/rooms";
import { planUpload, SNIFF_BYTES, STORED_NAME_PATTERN, verifyContent } from "@/lib/server/uploads";
import { getStorage } from "@/lib/storage";
import { parseAudioMeta } from "@/lib/types";
import { idSchema } from "@/lib/validation";

const bodySchema = z.object({
  key: z.string().max(200),
  name: z.string().min(1).max(500),
  caption: z.string().max(4000).optional(),
  replyToMessageId: idSchema.nullish(),
  durationMs: z.number().optional(),
  waveform: z.string().max(64).optional(),
});

/**
 * Called after a direct-to-storage upload finishes. Re-checks permissions, verifies the stored
 * file's real size and content (magic bytes), then creates the chat message.
 */
export async function POST(req: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  let keyToDiscard: string | null = null;
  try {
    const { roomCode } = await params;
    const { user, room } = await requireMember(roomCode);
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw Errors.badRequest("Invalid upload.");
    const { key, name, replyToMessageId } = parsed.data;
    const caption = (parsed.data.caption ?? "").replace(/\r\n/g, "\n").trim();

    const [prefix, storedName, ...rest] = key.split("/");
    const match = STORED_NAME_PATTERN.exec(storedName ?? "");
    if (prefix !== room.id || rest.length || !match) throw Errors.badRequest("Invalid upload.");

    const url = fileUrlForKey(key);
    if (await prisma.message.findFirst({ where: { fileUrl: url }, select: { id: true } })) {
      throw Errors.badRequest("This file was already sent.");
    }

    const storage = getStorage();
    const size = await storage.size(key);
    if (size === null) throw Errors.badRequest("Upload not found. Please try again.");
    keyToDiscard = key;

    const plan = planUpload(name, size);
    if (plan.ext !== match[1]) throw Errors.badRequest("Invalid upload.");
    const head = await storage.readStart(key, SNIFF_BYTES);
    const mimeType = await verifyContent(plan, head, head.length >= size);

    const message = await createMessage({
      user,
      room,
      content: caption || null,
      replyToMessageId,
      file: {
        type: plan.category,
        name: plan.safeName,
        url,
        mimeType,
        size,
        ...parseAudioMeta(parsed.data.durationMs, parsed.data.waveform),
      },
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    // A file that failed verification is removed so it can't linger in storage.
    if (keyToDiscard) await getStorage().delete(keyToDiscard).catch(() => {});
    return errorResponse(err);
  }
}
