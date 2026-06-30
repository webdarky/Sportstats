import { NextResponse } from "next/server";
import { searchTeams } from "@/lib/stats/query";

/** GET /api/search?q=arsenal%20corners — fuzzy team search + stat detection. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const results = searchTeams(q).map((r) => ({
    teamId: r.team.id,
    name: r.team.name,
    shortName: r.team.shortName,
    competition: r.competition?.name,
    competitionSlug: r.team.competitionSlug,
    score: Math.round(r.score * 100) / 100,
    detectedStat: r.detectedStat,
  }));

  return NextResponse.json({ query: q, results });
}
