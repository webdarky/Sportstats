import { NextResponse } from "next/server";
import { dataSource, hasDatabase } from "@/env";
import { adapters } from "@/lib/providers";
import { resolveRepository } from "@/lib/stats/repository";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — deployment introspection: which data source is serving
 * reads, whether the database is reachable, how much has been ingested, and
 * which provider adapters have credentials. Deliberately unauthenticated and
 * value-free: it reports only whether each key is *present*, never its value.
 */
export async function GET() {
  const { repo, active, configured, error } = await resolveRepository();

  let counts: { teams: number; matches: number } | null = null;
  try {
    counts = await repo.stats();
  } catch {
    // A database that answered the probe but fails on count still reports the
    // rest of the health payload rather than 500ing.
    counts = null;
  }

  const providers = adapters.map((a) => ({
    id: a.id,
    configured: a.isConfigured(),
  }));

  const degraded = configured === "postgres" && active === "demo";

  return NextResponse.json(
    {
      status: degraded ? "degraded" : "ok",
      dataSource: { configured: dataSource(), active, ...(error ? { error } : {}) },
      database: { configured: hasDatabase(), reachable: active === "postgres" },
      counts,
      providers,
      ingestion: {
        ready: hasDatabase() && providers.some((p) => p.configured),
      },
    },
    { status: degraded ? 503 : 200 },
  );
}
