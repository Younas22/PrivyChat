/**
 * Storage abstraction. Implement this interface for S3, Cloudflare R2,
 * Supabase Storage, etc. and return it from getStorage().
 */
export interface StorageDriver {
  /**
   * true when browsers upload straight to the storage provider (bypassing the 4.5 MB
   * serverless request limit); false when files are POSTed to our own upload route.
   */
  readonly clientUploads: boolean;
  /** Access level browsers must request for direct uploads (Vercel Blob store setting). */
  readonly clientAccess?: "public" | "private";
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  /** Returns size in bytes or null if the object doesn't exist. */
  size(key: string): Promise<number | null>;
  /** Reads the first `bytes` bytes (used to verify file types). */
  readStart(key: string, bytes: number): Promise<Buffer>;
  /** Streams an object through our own server (optionally a byte range, inclusive). */
  read(key: string, range?: { start: number; end: number }): Promise<ReadableStream<Uint8Array>>;
  /** If it returns a URL, the file route redirects authorized users there instead of streaming. */
  redirectUrl?(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  /** Deletes every object under a prefix (e.g. a whole room). */
  deletePrefix(prefix: string): Promise<void>;
}
