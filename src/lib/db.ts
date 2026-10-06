import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Builds the MariaDB/MySQL pool config from DATABASE_URL.
 * Serverless platforms run many instances, so each keeps a small pool (DB_CONNECTION_LIMIT)
 * to stay under the database's per-user connection limit. Add `?ssl=true` to the URL for TLS.
 */
export function poolConfig(url: string) {
  const u = new URL(url);
  const ssl = ["true", "1", "required"].includes((u.searchParams.get("ssl") ?? "").toLowerCase());
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 3,
    connectTimeout: 10_000,
    // Shared hosts (e.g. Hostinger: wait_timeout=20s) kill idle connections quickly.
    // Close idle connections before the server does; the pool also re-validates before reuse.
    // (minimumIdle must be >= 1: mariadb 3.4 never opens connections with 0.)
    idleTimeout: Number(process.env.DB_IDLE_TIMEOUT_SECONDS) || 15,
    minimumIdle: 1,
    ...(ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaMariaDb(poolConfig(url)) });
}

/** One client per process (reused across warm serverless invocations), created on first use. */
function getClient() {
  return (globalForPrisma.prisma ??= createClient());
}

/**
 * Lazy proxy: importing this module never touches the database, so `next build`
 * succeeds even when DATABASE_URL is only available at runtime.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
