import "server-only";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { RedirectOptions, StorageDriver } from "./types";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Reads R2 settings from the environment; null unless all of them are set. */
export function r2ConfigFromEnv(): R2Config | null {
  const raw = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  // Accept either the bare account id or the full "https://<id>.r2.cloudflarestorage.com" endpoint.
  const accountId = /^(?:https?:\/\/)?([a-f0-9]{32})(?:\.|$)/i.exec(raw)?.[1] ?? raw;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function createR2Client(config: R2Config) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // R2 does not support the SDK's default CRC32 checksums on presigned uploads.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

const isNotFound = (err: unknown) =>
  err instanceof S3ServiceException && (err.$metadata.httpStatusCode === 404 || err.name === "NotFound" || err.name === "NoSuchKey");

/**
 * Cloudflare R2 (S3-compatible) driver. The bucket stays private:
 * - browsers upload with a short-lived presigned PUT URL (see /upload/r2),
 * - authorized members are redirected to a short-lived presigned GET URL, so file bytes
 *   never pass through a serverless function (and R2 egress is free).
 */
export class R2StorageDriver implements StorageDriver {
  readonly clientUploads = true;
  readonly clientProvider = "r2" as const;
  private client: S3Client;
  private bucket: string;

  constructor(config: R2Config) {
    this.client = createR2Client(config);
    this.bucket = config.bucket;
  }

  /** Presigned URL the browser PUTs the file to. The Content-Type header must match. */
  async uploadUrl(key: string, contentType: string, expiresInSeconds = 15 * 60) {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), {
      expiresIn: expiresInSeconds,
    });
  }

  async put(key: string, data: Buffer, mimeType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mimeType }));
  }

  async size(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.ContentLength ?? null;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async read(key: string, range?: { start: number; end: number }) {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      }),
    );
    if (!res.Body) throw new Error("Object not found");
    return res.Body.transformToWebStream() as ReadableStream<Uint8Array>;
  }

  async readStart(key: string, bytes: number) {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
    );
    if (!res.Body) throw new Error("Object not found");
    return Buffer.from(await res.Body.transformToByteArray()).subarray(0, bytes);
  }

  async redirectUrl(key: string, opts: RedirectOptions = {}) {
    const name = opts.fileName ?? "file";
    const asciiName = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: opts.mimeType,
        ResponseContentDisposition: `${opts.download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      }),
      { expiresIn: 60 * 60 },
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string) {
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: `${prefix}/`, ContinuationToken: token }),
      );
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length) {
        await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }));
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }
}
