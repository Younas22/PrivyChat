import "server-only";
import { randomBytes } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { Errors } from "./errors";

export type UploadCategory = "image" | "video" | "document";

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
};

export function maxSizeFor(category: UploadCategory) {
  if (category === "image") return limitMb("MAX_IMAGE_MB", 10);
  if (category === "video") return limitMb("MAX_VIDEO_MB", 100);
  return limitMb("MAX_DOCUMENT_MB", 25);
}

export function maxUploadBytes() {
  return Math.max(maxSizeFor("image"), maxSizeFor("video"), maxSizeFor("document"));
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

export interface ValidatedUpload {
  category: UploadCategory;
  mimeType: string;
  safeName: string;
  storedName: string;
}

/** Validates extension, real content (magic bytes) and size. Throws a friendly AppError on failure. */
export async function validateUpload(originalName: string, data: Buffer): Promise<ValidatedUpload> {
  const safeName = sanitizeFileName(originalName);
  const ext = extensionOf(safeName);
  const category = categoryForExtension(ext);
  if (!category) {
    throw Errors.badRequest(
      "This file type isn't supported. Send images, videos, or common documents (PDF, Office, text).",
    );
  }
  if (data.length === 0) throw Errors.badRequest("This file is empty.");

  const max = maxSizeFor(category);
  if (data.length > max) {
    throw Errors.badRequest(`This file is too large. The maximum ${category} size is ${Math.round(max / MB)} MB.`);
  }

  const detected = await fileTypeFromBuffer(data);
  let mimeType: string;

  if (detected) {
    const allowed = RULES[category][ext] ?? [];
    if (!allowed.includes(detected.mime)) {
      throw Errors.badRequest("The file's contents don't match its extension, so it was rejected.");
    }
    mimeType = SERVE_MIME[ext] ?? detected.mime;
  } else if (ext in TEXT_DOCUMENTS && looksLikeText(data)) {
    mimeType = TEXT_DOCUMENTS[ext];
  } else {
    throw Errors.badRequest("We couldn't verify this file's type, so it was rejected.");
  }

  const storedName = `${randomBytes(16).toString("hex")}.${ext}`;
  return { category, mimeType, safeName, storedName };
}
