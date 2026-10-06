import "server-only";
import { LocalStorageDriver } from "./local";
import type { StorageDriver } from "./types";
import { VercelBlobDriver } from "./vercel-blob";

const globalForStorage = globalThis as unknown as { storage?: StorageDriver };

/** Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production), local disk otherwise. */
export function getStorage(): StorageDriver {
  return (globalForStorage.storage ??= process.env.BLOB_READ_WRITE_TOKEN
    ? new VercelBlobDriver()
    : new LocalStorageDriver(process.env.STORAGE_DIR || "storage/uploads"));
}

export type { StorageDriver };
