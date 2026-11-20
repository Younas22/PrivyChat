// Copies every file from the Vercel Blob store to Cloudflare R2 under the SAME key, so existing
// messages keep working without any database change. Safe to re-run: files already in R2 with
// the same size are skipped.
//
// Usage:  node --env-file=.env scripts/migrate-blob-to-r2.mjs
// Needs:  BLOB_READ_WRITE_TOKEN (+ BLOB_ACCESS if the store is public) and the R2_* variables.

import { Readable } from "node:stream";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { get, list } from "@vercel/blob";

const access = process.env.BLOB_ACCESS === "public" ? "public" : "private";
const rawAccount = process.env.R2_ACCOUNT_ID?.trim() ?? "";
const accountId = /^(?:https?:\/\/)?([a-f0-9]{32})(?:\.|$)/i.exec(rawAccount)?.[1] ?? rawAccount;
const bucket = process.env.R2_BUCKET?.trim();

const missing = ["BLOB_READ_WRITE_TOKEN", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter(
  (name) => !process.env[name]?.trim(),
);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(", ")}`);
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(), secretAccessKey: process.env.R2_SECRET_ACCESS_KEY.trim() },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

async function r2Size(key) {
  try {
    return (await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength ?? null;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

async function copy(blob) {
  if ((await r2Size(blob.pathname)) === blob.size) return "skipped";
  const result = await get(blob.pathname, { access });
  if (!result || result.statusCode !== 200) throw new Error(`could not read from Vercel Blob (status ${result?.statusCode})`);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: blob.pathname,
      Body: Readable.fromWeb(result.stream),
      ContentLength: blob.size,
      ContentType: result.blob?.contentType ?? "application/octet-stream",
    }),
  );
  return "copied";
}

const counts = { copied: 0, skipped: 0, failed: 0 };
const failures = [];
let cursor;
do {
  const page = await list({ cursor, limit: 1000 });
  // A few files at a time: fast enough, gentle on both services.
  for (let i = 0; i < page.blobs.length; i += 4) {
    await Promise.all(
      page.blobs.slice(i, i + 4).map(async (blob) => {
        try {
          const outcome = await copy(blob);
          counts[outcome]++;
          console.log(`${outcome === "copied" ? "✔ copied " : "• skipped"}  ${blob.pathname}  (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
        } catch (err) {
          counts.failed++;
          failures.push(blob.pathname);
          console.error(`✖ failed   ${blob.pathname}: ${err?.message ?? err}`);
        }
      }),
    );
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

console.log(`\nDone. copied: ${counts.copied}, already there: ${counts.skipped}, failed: ${counts.failed}`);
if (failures.length) {
  console.log("Re-run the script to retry the failed files.");
  process.exit(1);
}
