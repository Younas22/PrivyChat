import "server-only";
import { LocalStorageDriver } from "./local";
import { R2StorageDriver, r2ConfigFromEnv } from "./r2";
import type { DirectUploadMode } from "@/lib/types";
import type { StorageDriver } from "./types";
import { VercelBlobDriver } from "./vercel-blob";

const globalForStorage = globalThis as unknown as { storage?: StorageDriver };

/**
 * Cloudflare R2 when all R2_* variables are set, else Vercel Blob when BLOB_READ_WRITE_TOKEN
 * is set, local disk otherwise.
 * BLOB_ACCESS must match the Blob store's access setting: "private" (default) or "public".
 */
export function getStorage(): StorageDriver {
  return (globalForStorage.storage ??= createStorage());
}

function createStorage(): StorageDriver {
  const r2 = r2ConfigFromEnv();
  if (r2) return new R2StorageDriver(r2);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return new VercelBlobDriver(process.env.BLOB_ACCESS === "public" ? "public" : "private");
  }
  return new LocalStorageDriver(process.env.STORAGE_DIR || "storage/uploads");
}

/** Tells the chat page which upload flow its browser should use. */
export function directUploadMode(): DirectUploadMode {
  const storage = getStorage();
  if (!storage.clientUploads) return null;
  if (storage.clientProvider === "r2") return { provider: "r2" };
  return { provider: "vercel-blob", access: storage.clientAccess ?? "private" };
}

export type { StorageDriver };
