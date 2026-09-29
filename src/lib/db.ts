import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Prisma's default pool is (CPU cores × 2 + 1), which on shared hosts easily exceeds the
 * connection limit of managed poolers (e.g. Supabase session pooler: 15 on the free tier).
 * Cap it unless DATABASE_URL already sets connection_limit explicitly.
 */
function databaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw || /[?&]connection_limit=/.test(raw)) return raw;
  const limit = process.env.DB_POOL_SIZE?.trim() || "5";
  return `${raw}${raw.includes("?") ? "&" : "?"}connection_limit=${limit}&pool_timeout=20`;
}

export const db =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["warn", "error"], datasources: { db: { url: databaseUrl() } } });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
