import "server-only";
import { LocalStorageDriver } from "./local";
import type { StorageDriver } from "./types";

const globalForStorage = globalThis as unknown as { storage?: StorageDriver };

export function getStorage(): StorageDriver {
  // Add other drivers (S3, R2, Supabase) here based on an env variable.
  return (globalForStorage.storage ??= new LocalStorageDriver(process.env.STORAGE_DIR || "storage/uploads"));
}

export type { StorageDriver };
