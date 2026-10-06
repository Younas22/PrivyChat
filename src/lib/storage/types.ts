import type { Readable } from "node:stream";

/**
 * Storage abstraction. Implement this interface for S3, Cloudflare R2,
 * Supabase Storage, etc. and return it from getStorage().
 */
export interface StorageDriver {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  /** Returns size in bytes or null if the object doesn't exist. */
  size(key: string): Promise<number | null>;
  /** Reads an object (optionally a byte range, inclusive). */
  read(key: string, range?: { start: number; end: number }): Readable;
  delete(key: string): Promise<void>;
  /** Deletes every object under a prefix (e.g. a whole room). */
  deletePrefix(prefix: string): Promise<void>;
}
