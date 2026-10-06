import "server-only";
import { BlobNotFoundError, del, get, head, list, put } from "@vercel/blob";
import type { StorageDriver } from "./types";

type Access = "public" | "private";

/**
 * Vercel Blob driver. Browsers upload directly to Blob (see /upload/token), so files of any
 * allowed size skip the serverless request limit.
 * - private store (default): files are only readable with the store token, so the file route
 *   streams them to members after checking membership.
 * - public store (BLOB_ACCESS=public): files have unguessable URLs and members are redirected.
 */
export class VercelBlobDriver implements StorageDriver {
  readonly clientUploads = true;
  readonly clientAccess: Access;

  constructor(access: Access) {
    this.clientAccess = access;
    // Public stores can hand out direct URLs; private ones are always streamed by us.
    if (access === "private") this.redirectUrl = undefined;
  }

  async put(key: string, data: Buffer, mimeType: string) {
    await put(key, data, { access: this.clientAccess, contentType: mimeType, addRandomSuffix: false });
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

  async read(key: string, range?: { start: number; end: number }) {
    const result = await get(key, {
      access: this.clientAccess,
      headers: range ? { Range: `bytes=${range.start}-${range.end}` } : undefined,
    });
    if (!result || result.statusCode !== 200) throw new Error("Blob not found");
    return result.stream;
  }

  async readStart(key: string, bytes: number) {
    const reader = (await this.read(key, { start: 0, end: bytes - 1 })).getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < bytes) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel().catch(() => {});
    return Buffer.concat(chunks).subarray(0, bytes);
  }

  // Public URLs are "<store base>/<pathname>". Learn the base once, then build URLs without an API call.
  private baseUrl: string | null = null;

  redirectUrl?: (key: string) => Promise<string | null> = async (key) => {
    if (this.baseUrl) return `${this.baseUrl}/${key}`;
    const meta = await this.meta(key);
    if (!meta) return null;
    if (meta.url.endsWith(`/${key}`)) this.baseUrl = meta.url.slice(0, -key.length - 1);
    return meta.url;
  };

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
