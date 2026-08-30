import { PrismaClient } from "@prisma/client";
import { hasDatabase } from "@/env";

/**
 * Lazily-constructed PrismaClient.
 *
 * The app is deployable with no DATABASE_URL at all (demo mode), so this module
 * must be importable without a database. Constructing the client eagerly at
 * import time would run on every route that transitively imports it — including
 * the read paths that never touch Postgres — so the client is created on first
 * use instead, and only when a database is actually configured.
 *
 * In dev, Next.js hot-reload would otherwise spawn a new client (and connection
 * pool) on every edit, so we stash it on globalThis.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export class NoDatabaseConfiguredError extends Error {
  constructor() {
    super(
      "No DATABASE_URL is configured. Provision Postgres and set DATABASE_URL " +
        "to enable ingestion and the live read path (see SETUP.md).",
    );
    this.name = "NoDatabaseConfiguredError";
  }
}

/** Get the shared client, or throw if no database is configured. */
export function getDb(): PrismaClient {
  if (!hasDatabase()) throw new NoDatabaseConfiguredError();

  const existing = globalForPrisma.prisma;
  if (existing) return existing;

  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  // Cache in all environments: on serverless the module scope is per-instance
  // and reusing the pool across invocations is what we want.
  globalForPrisma.prisma = client;
  return client;
}
