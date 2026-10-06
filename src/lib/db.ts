import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Builds the MariaDB/MySQL pool config from DATABASE_URL.
 * Serverless platforms run many instances, so each keeps a small pool (DB_CONNECTION_LIMIT)
 * to stay under the database's per-user connection limit. Add `?ssl=true` to the URL for TLS.
 */
function poolConfig(url: string) {
  const u = new URL(url);
  const ssl = ["true", "1", "required"].includes((u.searchParams.get("ssl") ?? "").toLowerCase());
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 5,
    connectTimeout: 10_000,
    ...(ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaMariaDb(poolConfig(url)) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

// Reuse one client per process (also across warm serverless invocations).
globalForPrisma.prisma = prisma;
