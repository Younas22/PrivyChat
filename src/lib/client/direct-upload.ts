import { upload } from "@vercel/blob/client";
import type { ChatMessage } from "@/lib/types";
import { api, ApiError } from "./api";
import { fileExtension, mimeForName } from "./format";

function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Uploads straight from the browser to object storage (Vercel Blob), then asks our server to
 * verify the file and create the message. Large files never pass through a serverless function.
 */
export async function directUpload(opts: {
  base: string;
  roomId: string;
  file: File;
  caption: string;
  replyToMessageId: string | null;
  onProgress: (fraction: number) => void;
}): Promise<{ message: ChatMessage }> {
  const { base, roomId, file } = opts;
  const key = `${roomId}/${randomHex(16)}.${fileExtension(file.name).toLowerCase()}`;
  try {
    await upload(key, file, {
      access: "public",
      handleUploadUrl: `${base}/upload/token`,
      clientPayload: JSON.stringify({ name: file.name, size: file.size }),
      contentType: mimeForName(file.name),
      multipart: file.size > 8 * 1024 * 1024,
      onUploadProgress: (e) => opts.onProgress(e.percentage / 100),
    });
  } catch {
    throw new ApiError(
      navigator.onLine ? "Upload failed. Please try again." : "Network error. Check your connection and try again.",
      "upload_failed",
      0,
    );
  }
  return api(`${base}/upload/complete`, {
    method: "POST",
    json: { key, name: file.name, caption: opts.caption, replyToMessageId: opts.replyToMessageId },
  });
}
