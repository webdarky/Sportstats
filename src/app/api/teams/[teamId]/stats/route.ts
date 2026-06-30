import { NextResponse } from "next/server";
import { getTeamStat } from "@/lib/stats/query";

/**
 * GET /api/teams/:teamId/stats?stat=corners&timeframe=all&competition=...
 * Returns the dashboard summary (totals, averages, combined, trend, histogram).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const sp = new URL(request.url).searchParams;
  const statTypeId = sp.get("stat") ?? "corners";
  const timeframe = sp.get("timeframe") ?? "all";
  const competitionSlug = sp.get("competition") ?? undefined;

  const result = getTeamStat({ teamId, statTypeId, timeframe, competitionSlug });
  if (!result) {
    return NextResponse.json(
      { error: "unknown team or stat" },
      { status: 404 },
    );
  }
  return NextResponse.json(result);
}
