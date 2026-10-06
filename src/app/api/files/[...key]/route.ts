import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError, errorResponse } from "@/lib/server/errors";
import { authorizeFileAccess, fileUrlForKey } from "@/lib/server/rooms";
import { getStorage } from "@/lib/storage";

const KEY_PATTERN = /^([a-z0-9]{10,40})\/[a-f0-9]{32}\.[a-z0-9]{1,8}$/;
const INLINE_TYPES = /^(image\/(jpeg|png|webp|gif)|video\/|audio\/|application\/pdf$|text\/plain$)/;

// Keep each streamed range below Vercel's ~4.5 MB response limit; media players fetch the next range.
const MAX_RANGE_BYTES = 4 * 1024 * 1024;

const notFound = () => new AppError(404, "file_not_found", "This file is no longer available.");

function parseRange(header: string | null, size: number) {
  const match = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (Number.isNaN(start)) {
    // suffix range: last N bytes
    start = Math.max(0, size - end);
    end = size - 1;
  }
  end = Math.min(end, size - 1, start + MAX_RANGE_BYTES - 1);
  if (start > end || start >= size) return "invalid" as const;
  return { start, end };
}

/** Streams an uploaded file to active members of its room only (supports Range for video seeking). */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const key = (await params).key.join("/");
    const match = KEY_PATTERN.exec(key);
    if (!match) throw notFound();
    await authorizeFileAccess(match[1]);

    const message = await prisma.message.findFirst({
      where: { roomId: match[1], fileUrl: fileUrlForKey(key), deletedAt: null },
      select: { fileName: true, fileMimeType: true, fileSize: true },
    });
    if (!message) throw notFound();
    const storage = getStorage();
    const mime = message.fileMimeType ?? "application/octet-stream";
    const download = new URL(req.url).searchParams.has("download") || !INLINE_TYPES.test(mime);

    // Public object storage: hand the (unguessable) file URL to the authorized member only.
    const target = storage.redirectUrl ? await storage.redirectUrl(key) : null;
    if (target) {
      const res = NextResponse.redirect(download ? `${target}?download=1` : target, 302);
      // Let the browser reuse the redirect briefly so images don't hit the server on every render.
      res.headers.set("Cache-Control", "private, max-age=600");
      res.headers.set("Referrer-Policy", "no-referrer");
      return res;
    }

    // Size is stored with the message, so streaming needs no extra storage lookup.
    const size = message.fileSize ?? (await storage.size(key));
    if (size === null) throw notFound();
    const name = message.fileName ?? "file";
    const asciiName = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

    const headers = new Headers({
      "Content-Type": mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    });

    const range = parseRange(req.headers.get("range"), size);
    if (range === "invalid") {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    if (range) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(await storage.read(key, range), { status: 206, headers });
    }
    headers.set("Content-Length", String(size));
    return new Response(await storage.read(key), { status: 200, headers });
  } catch (err) {
    return errorResponse(err);
  }
}
