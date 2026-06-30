import { aggregateMatch } from "../consensus/aggregate";
import type { Match } from "./types";

/**
 * Per-match view of a single stat from one team's perspective: the team's own
 * consensus value, the opponent's, and the combined total. This is the shape
 * the dashboard calculators (blueprint Part 4) operate on.
 */
export interface TeamStatGame {
  matchId: string;
  kickoff: string;
  competitionSlug: string;
  isHome: boolean;
  opponentId: string;
  teamValue: number;
  opponentValue: number;
  combined: number;
  /** Max consensus variance across the two sides; high => show as a range. */
  variance: number;
}

export interface StatFilter {
  /** Only include matches on/after this ISO date. */
  since?: string;
  /** Restrict to a single competition slug. */
  competitionSlug?: string;
}

/**
 * Build the per-game stat views for a team, computing consensus on the fly from
 * each match's raw observations. Sorted by kickoff ascending (trend order).
 */
export function buildTeamStatGames(
  matches: Match[],
  teamId: string,
  statTypeId: string,
  filter: StatFilter = {},
): TeamStatGame[] {
  const games: TeamStatGame[] = [];

  for (const match of matches) {
    const isHome = match.homeTeamId === teamId;
    const isAway = match.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    if (filter.competitionSlug && match.competitionSlug !== filter.competitionSlug) {
      continue;
    }
    if (filter.since && match.kickoff < filter.since) continue;

    const opponentId = isHome ? match.awayTeamId : match.homeTeamId;

    // Consensus for just this stat, both teams.
    const relevant = match.observations.filter((o) => o.statTypeId === statTypeId);
    if (relevant.length === 0) continue;
    const consensus = aggregateMatch(match.id, relevant);

    const teamC = consensus.find((c) => c.teamId === teamId);
    const oppC = consensus.find((c) => c.teamId === opponentId);
    if (!teamC) continue;

    const teamValue = teamC.value;
    const opponentValue = oppC?.value ?? 0;

    games.push({
      matchId: match.id,
      kickoff: match.kickoff,
      competitionSlug: match.competitionSlug,
      isHome,
      opponentId,
      teamValue,
      opponentValue,
      combined: teamValue + opponentValue,
      variance: Math.max(teamC.variance, oppC?.variance ?? 0),
    });
  }

  games.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  return games;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export interface StatSummary {
  games: number;
  /** Sum of the team's own value across all games (e.g. total corners). */
  totalAllTime: number;
  /** Mean of the team's own value per game. */
  averagePerGame: number;
  /** Mean of (team + opponent) per game — e.g. combined corners in the match. */
  combinedAveragePerGame: number;
  /** Min / max of the team's per-game value. */
  min: number;
  max: number;
  /** Time-ordered series for the trend chart. */
  trend: Array<{ kickoff: string; value: number; opponentId: string }>;
  /** Integer-bucketed histogram of the team's per-game value. */
  distribution: Array<{ bucket: number; count: number }>;
}

/** Compute the full dashboard summary for a team + stat. */
export function summarize(games: TeamStatGame[]): StatSummary {
  if (games.length === 0) {
    return {
      games: 0,
      totalAllTime: 0,
      averagePerGame: 0,
      combinedAveragePerGame: 0,
      min: 0,
      max: 0,
      trend: [],
      distribution: [],
    };
  }

  const values = games.map((g) => g.teamValue);
  const total = values.reduce((a, b) => a + b, 0);
  const combinedTotal = games.reduce((a, g) => a + g.combined, 0);

  // Histogram on rounded integer buckets.
  const buckets = new Map<number, number>();
  for (const v of values) {
    const b = Math.round(v);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
  }
  const distribution = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, count]) => ({ bucket, count }));

  return {
    games: games.length,
    totalAllTime: round(total),
    averagePerGame: round(total / games.length),
    combinedAveragePerGame: round(combinedTotal / games.length),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    trend: games.map((g) => ({
      kickoff: g.kickoff,
      value: round(g.teamValue),
      opponentId: g.opponentId,
    })),
    distribution,
  };
}

/** Translate a timeframe token from the UI into a `since` ISO date. */
export function timeframeToSince(
  timeframe: string,
  now: Date = new Date(),
): string | undefined {
  const months: Record<string, number> = {
    "1m": 1,
    "6m": 6,
    "1y": 12,
    "3y": 36,
    "5y": 60,
  };
  if (timeframe === "all" || !(timeframe in months)) return undefined;
  const d = new Date(now);
  d.setMonth(d.getMonth() - months[timeframe]!);
  return d.toISOString();
}
