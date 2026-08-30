import { NextResponse } from "next/server";
import { env, hasDatabase } from "@/env";
import { adapters } from "@/lib/providers";
import { runIngestion } from "@/lib/ingest/pipeline";
import { PrismaIngestRepository } from "@/lib/ingest/prisma-repository";

export const dynamic = "force-dynamic";

/**
 * Data-ingestion cron endpoint. Protected by CRON_SECRET (blueprint security
 * notes) — callers must send `Authorization: Bearer $CRON_SECRET`. Wire this to
 * a scheduler (Vercel Cron / GitHub Actions) to poll providers on an interval.
 *
 *   GET /api/cron/ingest?competition=england-premier-league&days=3
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Ingestion writes to Postgres; without it there is nowhere to put the data.
  if (!hasDatabase()) {
    return NextResponse.json(
      {
        error: "no database configured",
        detail:
          "Set DATABASE_URL to enable ingestion. The app runs in demo mode until then.",
      },
      { status: 503 },
    );
  }

  const configured = adapters.filter((a) => a.isConfigured());
  if (configured.length === 0) {
    return NextResponse.json(
      {
        error: "no providers configured",
        detail:
          "Set at least one provider key (e.g. API_FOOTBALL_KEY) to ingest data.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const competition = url.searchParams.get("competition");
  if (!competition) {
    return NextResponse.json(
      { error: "competition query param is required" },
      { status: 400 },
    );
  }
  const days = Number(url.searchParams.get("days") ?? "3");
  const from = new Date();
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

  try {
    const report = await runIngestion(adapters, new PrismaIngestRepository(), {
      competition,
      from,
      to,
    });
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
