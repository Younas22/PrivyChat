import "server-only";
import { Readable } from "node:stream";
import { BlobNotFoundError, del, head, list, put } from "@vercel/blob";
import type { StorageDriver } from "./types";

/**
 * Vercel Blob driver. Browsers upload directly to Blob (see /upload/token), so files of any
 * allowed size skip the serverless request limit. Pathnames contain a 128-bit random name and
 * are only revealed to room members by the file route, which checks membership first.
 */
export class VercelBlobDriver implements StorageDriver {
  readonly clientUploads = true;

  async put(key: string, data: Buffer, mimeType: string) {
    await put(key, data, { access: "public", contentType: mimeType, addRandomSuffix: false });
  }

  private async meta(key: string) {
    try {
      return await head(key);
    } catch (err) {
      if (err instanceof BlobNotFoundError) return null;
      throw err;
    }
  }

  async size(key: string) {
    return (await this.meta(key))?.size ?? null;
  }

  async readStart(key: string, bytes: number) {
    const meta = await this.meta(key);
    if (!meta) throw new Error("Blob not found");
    const res = await fetch(meta.url, { headers: { Range: `bytes=0-${bytes - 1}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`Blob read failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).subarray(0, bytes);
  }

  read(): Readable {
    throw new Error("Vercel Blob files are served via redirectUrl()");
  }

  async redirectUrl(key: string) {
    return (await this.meta(key))?.url ?? null;
  }

  async delete(key: string) {
    await del(key);
  }

  async deletePrefix(prefix: string) {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `${prefix}/`, cursor, limit: 1000 });
      if (page.blobs.length) await del(page.blobs.map((b) => b.url));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
}
