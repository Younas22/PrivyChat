import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { StorageDriver } from "./types";

const KEY_PATTERN = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)*$/;

export class LocalStorageDriver implements StorageDriver {
  readonly clientUploads = false;
  private root: string;

  constructor(dir: string) {
    this.root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), dir);
  }

  private resolve(key: string) {
    if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error("Invalid storage key");
    const full = path.resolve(/*turbopackIgnore: true*/ this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async size(key: string) {
    try {
      const s = await stat(this.resolve(key));
      return s.isFile() ? s.size : null;
    } catch {
      return null;
    }
  }

  async readStart(key: string, bytes: number) {
    const handle = await open(this.resolve(key), "r");
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async read(key: string, range?: { start: number; end: number }) {
    return Readable.toWeb(createReadStream(this.resolve(key), range)) as ReadableStream<Uint8Array>;
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  async deletePrefix(prefix: string) {
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }
}
