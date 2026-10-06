import { createConnection } from "mariadb";
import { NextResponse } from "next/server";
import { poolConfig, prisma } from "@/lib/db";
import { pusherConfig } from "@/lib/server/realtime";

export const dynamic = "force-dynamic";

/** Finds the most specific driver error code in a (Prisma-wrapped) error chain. */
function describe(err: unknown) {
  const seen: Record<string, unknown>[] = [];
  let cur: unknown = err;
  while (cur && typeof cur === "object" && seen.length < 6) {
    seen.push(cur as Record<string, unknown>);
    cur = (cur as { cause?: unknown }).cause;
  }
  const pick = (k: string) => seen.map((e) => e[k]).find((v) => typeof v === "string" || typeof v === "number");
  const message = String(seen.at(-1)?.message ?? err)
    .replace(/mysql:\/\/[^\s]+/g, "mysql://***")
    .slice(0, 300);
  return { code: pick("code") ?? pick("originalCode") ?? null, kind: pick("kind") ?? null, message };
}

/** Deployment health check: config presence + a real database round trip. Never returns secrets. */
export async function GET() {
  const url = process.env.DATABASE_URL;
  let target: Record<string, unknown> = { set: Boolean(url) };
  if (url) {
    try {
      const u = new URL(url);
      target = {
        set: true,
        protocol: u.protocol,
        host: u.hostname,
        port: u.port || "3306",
        database: u.pathname.slice(1),
        user: decodeURIComponent(u.username),
        passwordSet: Boolean(u.password),
        startsWithQuote: /^["']/.test(url),
      };
    } catch {
      target = { set: true, parseError: "DATABASE_URL is not a valid URL (check for quotes or a 'DATABASE_URL=' prefix)" };
    }
  }

  let database: Record<string, unknown> = {};
  const started = Date.now();
  try {
    const tables = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM ChatRoom`;
    database = { ok: true, ms: Date.now() - started, rooms: Number(tables[0]?.n ?? 0) };
  } catch (err) {
    database = { ok: false, ms: Date.now() - started, ...describe(err) };
    // The pool hides the real cause (e.g. wrong password shows as "pool timeout"), so try one direct connection.
    if (url) {
      try {
        const conn = await createConnection(poolConfig(url));
        await conn.end();
        database.directConnection = "ok";
      } catch (e) {
        const d = e as { code?: string; errno?: number; sqlMessage?: string; message?: string };
        database.directConnection = { code: d.code, errno: d.errno, message: String(d.sqlMessage ?? d.message).slice(0, 200) };
      }
    }
  }

  return NextResponse.json(
    {
      databaseUrl: target,
      database,
      region: process.env.VERCEL_REGION ?? "local",
      pusher: Boolean(pusherConfig()),
      blobStorage: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
