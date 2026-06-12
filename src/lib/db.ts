import { PrismaClient } from "@prisma/client";

/**
 * Single shared PrismaClient. In dev, Next.js hot-reload would otherwise spawn
 * a new client (and connection pool) on every edit, so we stash it on globalThis.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
