import { getDb } from "../db";
import type { Competition, Match, RawObservation, Team } from "./types";
import type { MatchFilter, StatsRepository } from "./repository";

/**
 * Postgres-backed read repository — the live path, reading what the ingestion
 * pipeline wrote.
 *
 * It reads raw `StatValue` rows (one per source) rather than the stored
 * `ConsensusValue`, and lets the calculators recompute consensus on read. See
 * the note in repository.ts for why.
 */

/** Cap on rows pulled for a single team view; a season is ~40 matches. */
const MATCH_LIMIT = 500;

/** Prisma's shortName is optional; the UI always wants something short. */
function shortNameFor(name: string, shortName: string | null): string {
  if (shortName) return shortName;
  const initials = name
    .split(/\s+/)
    .filter((w) => /[a-z]/i.test(w[0] ?? ""))
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (initials.length >= 2 ? initials : name.slice(0, 3).toUpperCase()).slice(0, 4);
}

export class PrismaStatsRepository implements StatsRepository {
  readonly mode = "postgres" as const;

  /** Connectivity probe used by repository selection. */
  async ping(): Promise<void> {
    await getDb().$queryRaw`SELECT 1`;
  }

  async listCompetitions(): Promise<Competition[]> {
    const rows = await getDb().competition.findMany({
      include: { sport: true },
      orderBy: [{ sport: { priority: "asc" } }, { name: "asc" }],
    });
    return rows.map((c) => ({
      slug: c.slug,
      name: c.name,
      sportSlug: c.sport.slug,
    }));
  }

  async listTeams(competitionSlug?: string): Promise<Team[]> {
    const inCompetition = competitionSlug
      ? { season: { competition: { slug: competitionSlug } } }
      : undefined;

    const rows = await getDb().team.findMany({
      where: inCompetition
        ? {
            OR: [
              { homeMatches: { some: inCompetition } },
              { awayMatches: { some: inCompetition } },
            ],
          }
        : {},
      // One recent match per side is enough to attribute the team to a
      // competition; Team has no direct competition FK (a club can play in
      // several), so we derive it from where they most recently played.
      include: {
        homeMatches: {
          take: 1,
          orderBy: { kickoff: "desc" },
          include: { season: { include: { competition: true } } },
        },
        awayMatches: {
          take: 1,
          orderBy: { kickoff: "desc" },
          include: { season: { include: { competition: true } } },
        },
      },
      orderBy: { name: "asc" },
      take: MATCH_LIMIT,
    });

    return rows.map((t) => {
      const recent =
        t.homeMatches[0]?.season.competition ?? t.awayMatches[0]?.season.competition;
      return {
        id: t.id,
        name: t.name,
        shortName: shortNameFor(t.name, t.shortName),
        competitionSlug: competitionSlug ?? recent?.slug ?? "",
      };
    });
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const t = await getDb().team.findUnique({
      where: { id },
      include: {
        homeMatches: {
          take: 1,
          orderBy: { kickoff: "desc" },
          include: { season: { include: { competition: true } } },
        },
        awayMatches: {
          take: 1,
          orderBy: { kickoff: "desc" },
          include: { season: { include: { competition: true } } },
        },
      },
    });
    if (!t) return undefined;

    const recent =
      t.homeMatches[0]?.season.competition ?? t.awayMatches[0]?.season.competition;
    return {
      id: t.id,
      name: t.name,
      shortName: shortNameFor(t.name, t.shortName),
      competitionSlug: recent?.slug ?? "",
    };
  }

  async matchesForTeam(teamId: string, filter: MatchFilter = {}): Promise<Match[]> {
    const rows = await getDb().match.findMany({
      where: {
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        ...(filter.since ? { kickoff: { gte: new Date(filter.since) } } : {}),
        ...(filter.competitionSlug
          ? { season: { competition: { slug: filter.competitionSlug } } }
          : {}),
      },
      include: {
        season: { include: { competition: true } },
        statValues: true,
      },
      orderBy: { kickoff: "asc" },
      take: MATCH_LIMIT,
    });

    return rows.map((m) => {
      const observations: RawObservation[] = [];
      for (const sv of m.statValues) {
        // Team-level rows only; player stats are a separate view.
        if (!sv.teamId || sv.playerId) continue;
        observations.push({
          statTypeId: sv.statTypeId,
          teamId: sv.teamId,
          sourceId: sv.sourceId,
          value: sv.value,
        });
      }

      return {
        id: m.id,
        competitionSlug: m.season.competition.slug,
        seasonLabel: m.season.label,
        round: m.round ?? "",
        kickoff: (m.kickoff ?? m.createdAt).toISOString(),
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: m.homeScore ?? 0,
        awayScore: m.awayScore ?? 0,
        observations,
      };
    });
  }

  async stats(): Promise<{ teams: number; matches: number }> {
    const db = getDb();
    const [teams, matches] = await Promise.all([
      db.team.count(),
      db.match.count(),
    ]);
    return { teams, matches };
  }
}
