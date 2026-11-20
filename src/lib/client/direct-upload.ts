import { upload } from "@vercel/blob/client";
import type { ChatMessage, DirectUploadMode } from "@/lib/types";
import { api, ApiError } from "./api";
import { fileExtension, mimeForName } from "./format";

function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** PUTs a file to a presigned URL with progress events. */
function putWithProgress(url: string, file: File, contentType: string, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`storage responded ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(file);
  });
}

/**
 * Uploads straight from the browser to object storage (Cloudflare R2 or Vercel Blob), then asks our server to
 * verify the file and create the message. Large files never pass through a serverless function.
 */
export async function directUpload(opts: {
  base: string;
  roomId: string;
  mode: NonNullable<DirectUploadMode>;
  file: File;
  caption: string;
  replyToMessageId: string | null;
  /** Audio only: exact length + loudness bars. */
  audioMeta?: { durationMs: number; waveform: string | null } | null;
  onProgress: (fraction: number) => void;
}): Promise<{ message: ChatMessage }> {
  const { base, roomId, file } = opts;
  const key = `${roomId}/${randomHex(16)}.${fileExtension(file.name).toLowerCase()}`;
  try {
    if (opts.mode.provider === "r2") {
      const { url, contentType } = await api<{ url: string; contentType: string }>(`${base}/upload/r2`, {
        method: "POST",
        json: { key, name: file.name, size: file.size, contentType: mimeForName(file.name) },
      });
      await putWithProgress(url, file, contentType, opts.onProgress);
    } else {
      await upload(key, file, {
        access: opts.mode.access,
        handleUploadUrl: `${base}/upload/token`,
        clientPayload: JSON.stringify({ name: file.name, size: file.size }),
        contentType: mimeForName(file.name),
        multipart: file.size > 8 * 1024 * 1024,
        onUploadProgress: (e) => opts.onProgress(e.percentage / 100),
      });
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (!navigator.onLine) throw new ApiError("Network error. Check your connection and try again.", "network", 0);
    console.error("Direct upload failed", err);
    const reason = err instanceof Error ? err.message.replace(/^Vercel Blob:s*/i, "") : "";
    throw new ApiError(reason ? `Upload failed: ${reason}` : "Upload failed. Please try again.", "upload_failed", 0);
  }
  return api(`${base}/upload/complete`, {
    method: "POST",
    json: {
      key,
      name: file.name,
      caption: opts.caption,
      replyToMessageId: opts.replyToMessageId,
      durationMs: opts.audioMeta?.durationMs,
      waveform: opts.audioMeta?.waveform ?? undefined,
    },
  });
}
