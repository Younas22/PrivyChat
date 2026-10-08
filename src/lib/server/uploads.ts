import "server-only";
import { randomBytes } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { Errors } from "./errors";

export type UploadCategory = "image" | "video" | "document" | "audio";

const MB = 1024 * 1024;
const limitMb = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return (Number.isFinite(n) && n > 0 ? n : fallback) * MB;
};

/** extension -> MIME types accepted for the *detected* content (magic bytes). */
const RULES: Record<UploadCategory, Record<string, string[]>> = {
  image: {
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    png: ["image/png"],
    webp: ["image/webp"],
    gif: ["image/gif"],
  },
  video: {
    mp4: ["video/mp4"],
    m4v: ["video/mp4", "video/x-m4v"],
    webm: ["video/webm"],
    mov: ["video/quicktime"],
    ogv: ["video/ogg"],
  },
  document: {
    pdf: ["application/pdf"],
    docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"],
    pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip"],
    doc: ["application/x-cfb", "application/msword"],
    xls: ["application/x-cfb", "application/vnd.ms-excel"],
    ppt: ["application/x-cfb", "application/vnd.ms-powerpoint"],
    odt: ["application/vnd.oasis.opendocument.text", "application/zip"],
    ods: ["application/vnd.oasis.opendocument.spreadsheet", "application/zip"],
    zip: ["application/zip"],
    rtf: ["application/rtf", "text/rtf"],
  },
  // Voice notes (browser recordings: .weba / .ogg / .m4a) and common audio files.
  audio: {
    weba: ["audio/webm", "video/webm"],
    ogg: ["audio/ogg", "audio/opus"],
    oga: ["audio/ogg", "audio/opus"],
    opus: ["audio/ogg", "audio/opus"],
    m4a: ["audio/x-m4a", "audio/mp4", "audio/m4a", "video/mp4"],
    mp3: ["audio/mpeg"],
    wav: ["audio/wav", "audio/vnd.wave", "audio/x-wav"],
    aac: ["audio/aac", "audio/x-aac"],
  },
};

/** Plain-text documents have no magic bytes; accepted only if the content is valid UTF-8 text. */
const TEXT_DOCUMENTS: Record<string, string> = {
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  json: "application/json",
  rtf: "application/rtf",
};

/** MIME type we serve the file as (the browser-provided type is never trusted). */
const SERVE_MIME: Record<string, string> = {
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  m4v: "video/mp4",
  weba: "audio/webm",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
};

export function maxSizeFor(category: UploadCategory) {
  if (category === "image") return limitMb("MAX_IMAGE_MB", 10);
  if (category === "video") return limitMb("MAX_VIDEO_MB", 100);
  if (category === "audio") return limitMb("MAX_AUDIO_MB", 25);
  return limitMb("MAX_DOCUMENT_MB", 500);
}

export function maxUploadBytes() {
  return Math.max(maxSizeFor("image"), maxSizeFor("video"), maxSizeFor("document"), maxSizeFor("audio"));
}

function extensionOf(name: string) {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return match ? match[1].toLowerCase() : "";
}

function categoryForExtension(ext: string): UploadCategory | null {
  for (const category of Object.keys(RULES) as UploadCategory[]) {
    if (ext in RULES[category]) return category;
  }
  if (ext in TEXT_DOCUMENTS) return "document";
  return null;
}

function looksLikeText(buf: Buffer) {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeFileName(name: string) {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "file").slice(-200);
}

export interface UploadPlan {
  category: UploadCategory;
  ext: string;
  safeName: string;
}

/** Bytes needed from the start of a file to verify its type (plain-text files are checked further). */
export const SNIFF_BYTES = 64 * 1024;

/** Checks name, extension and size before any bytes are stored. Throws a friendly AppError on failure. */
export function planUpload(originalName: string, size: number): UploadPlan {
  const safeName = sanitizeFileName(originalName);
  const ext = extensionOf(safeName);
  const category = categoryForExtension(ext);
  if (!category) {
    throw Errors.badRequest(
      "This file type isn't supported. Send images, videos, audio, or common documents (PDF, Office, text).",
    );
  }
  if (size <= 0) throw Errors.badRequest("This file is empty.");
  const max = maxSizeFor(category);
  if (size > max) {
    throw Errors.badRequest(`This file is too large. The maximum ${category} size is ${Math.round(max / MB)} MB.`);
  }
  return { category, ext, safeName };
}

/** Allowed browser Content-Types for a planned upload (used to restrict direct-to-storage uploads). */
export function allowedContentTypes(plan: UploadPlan) {
  return [...new Set([...(RULES[plan.category][plan.ext] ?? []), TEXT_DOCUMENTS[plan.ext], SERVE_MIME[plan.ext]])].filter(
    (t): t is string => Boolean(t),
  );
}

/**
 * Verifies the real content (magic bytes) of a file and returns the MIME type to serve it with.
 * `head` is the start of the file; `complete` says whether it is the whole file.
 */
export async function verifyContent(plan: UploadPlan, head: Buffer, complete: boolean): Promise<string> {
  const detected = await fileTypeFromBuffer(head);
  if (detected) {
    const allowed = RULES[plan.category][plan.ext] ?? [];
    if (!allowed.includes(detected.mime)) {
      throw Errors.badRequest("The file's contents don't match its extension, so it was rejected.");
    }
    return SERVE_MIME[plan.ext] ?? detected.mime;
  }
  if (plan.ext in TEXT_DOCUMENTS) {
    // Don't judge a multi-byte character cut off at the end of a partial read.
    let end = head.length;
    if (!complete) while (end > 0 && head[end - 1] >= 0x80) end--;
    const sample = head.subarray(0, end);
    if (looksLikeText(sample)) return TEXT_DOCUMENTS[plan.ext];
  }
  throw Errors.badRequest("We couldn't verify this file's type, so it was rejected.");
}

export function randomStoredName(ext: string) {
  return `${randomBytes(16).toString("hex")}.${ext}`;
}

export const STORED_NAME_PATTERN = /^[a-f0-9]{32}\.([a-z0-9]{1,8})$/;
