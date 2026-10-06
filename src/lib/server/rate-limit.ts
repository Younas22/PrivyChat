import "server-only";
import { Errors } from "./errors";

type Bucket = { hits: number[] };
const globalForLimits = globalThis as unknown as { rateBuckets?: Map<string, Bucket> };
const buckets = (globalForLimits.rateBuckets ??= new Map<string, Bucket>());

/**
 * Basic in-memory sliding-window rate limiter (per process).
 * Swap for Redis/Upstash if you run multiple instances.
 */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) throw Errors.rateLimited();
  bucket.hits.push(now);
  buckets.set(key, bucket);

  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
}
