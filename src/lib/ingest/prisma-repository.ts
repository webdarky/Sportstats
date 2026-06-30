import { db } from "../db";
import {
  AUTO_MATCH_THRESHOLD,
  resolveEntity,
  type Candidate,
} from "../entity-resolution/resolver";
import type { IngestRepository, ResolvedMatch } from "./pipeline";

/**
 * Prisma-backed IngestRepository — the production persistence + entity
 * resolution path. Phase 1 is football-only, so the sport is fixed; multi-sport
 * ingestion threads the sport through in Phase 2.
 *
 * We deliberately use findFirst + create/update rather than upsert on the
 * nullable composite uniques (teamId/playerId), because Postgres treats NULLs
 * as distinct and would let upsert create duplicates for team-level rows.
 */
const SPORT_SLUG = "football";

export class PrismaIngestRepository implements IngestRepository {
  private sportIdCache: string | null = null;

  private async sportId(): Promise<string> {
    if (this.sportIdCache) return this.sportIdCache;
    const sport = await db.sport.upsert({
      where: { slug: SPORT_SLUG },
      update: {},
      create: { slug: SPORT_SLUG, name: "Football" },
    });
    this.sportIdCache = sport.id;
    return sport.id;
  }

  private async competitionId(slug: string): Promise<string> {
    const sportId = await this.sportId();
    const comp = await db.competition.upsert({
      where: { slug },
      update: {},
      create: { slug, name: slug, sportId },
    });
    return comp.id;
  }

  private async seasonId(competitionId: string, kickoff: Date): Promise<string> {
    // Football seasons span Aug–May; label by the season's starting year.
    const year =
      kickoff.getUTCMonth() >= 6
        ? kickoff.getUTCFullYear()
        : kickoff.getUTCFullYear() - 1;
    const label = `${year}/${year + 1}`;
    const season = await db.season.upsert({
      where: { competitionId_label: { competitionId, label } },
      update: {},
      create: { competitionId, label },
    });
    return season.id;
  }

  async resolveTeam(input: {
    sourceId: string;
    nativeId: string;
    name: string;
  }): Promise<string> {
    // 1. Deterministic crosswalk hit.
    const existing = await db.providerIdMap.findUnique({
      where: {
        sourceId_entityType_nativeId: {
          sourceId: input.sourceId,
          entityType: "TEAM",
          nativeId: input.nativeId,
        },
      },
    });
    if (existing) return existing.canonicalId;

    // 2/3. Exact / fuzzy match against known teams in this sport.
    const sportId = await this.sportId();
    const teams = await db.team.findMany({ where: { sportId } });
    const candidates: Candidate[] = teams.map((t) => ({
      canonicalId: t.id,
      name: t.name,
      block: { sport: SPORT_SLUG },
    }));
    const resolution = resolveEntity(
      { name: input.name, block: { sport: SPORT_SLUG } },
      candidates,
    );

    let canonicalId: string;
    let confidence = 1;
    let needsReview = false;
    if (resolution.status === "matched") {
      canonicalId = resolution.canonicalId;
      confidence = resolution.confidence;
    } else {
      // Create a new canonical team (review-flagged if it was a near miss).
      const created = await db.team.create({
        data: { name: input.name, sportId },
      });
      canonicalId = created.id;
      if (resolution.status === "review") {
        confidence = resolution.confidence;
        needsReview = true;
      }
    }

    await db.providerIdMap.create({
      data: {
        sourceId: input.sourceId,
        entityType: "TEAM",
        nativeId: input.nativeId,
        canonicalId,
        confidence,
        needsReview,
      },
    });
    return canonicalId;
  }

  async resolveMatch(fixture: {
    sourceId: string;
    nativeMatchId: string;
    kickoff: Date;
    competition: string;
    homeTeam: { nativeId: string; name: string };
    awayTeam: { nativeId: string; name: string };
  }): Promise<ResolvedMatch> {
    const mapped = await db.providerIdMap.findUnique({
      where: {
        sourceId_entityType_nativeId: {
          sourceId: fixture.sourceId,
          entityType: "MATCH",
          nativeId: fixture.nativeMatchId,
        },
      },
    });

    const homeTeamId = await this.resolveTeam({
      sourceId: fixture.sourceId,
      nativeId: fixture.homeTeam.nativeId,
      name: fixture.homeTeam.name,
    });
    const awayTeamId = await this.resolveTeam({
      sourceId: fixture.sourceId,
      nativeId: fixture.awayTeam.nativeId,
      name: fixture.awayTeam.name,
    });

    if (mapped) {
      return { matchId: mapped.canonicalId, homeTeamId, awayTeamId };
    }

    const competitionId = await this.competitionId(fixture.competition);
    const seasonId = await this.seasonId(competitionId, fixture.kickoff);

    // Reuse an existing match for the same season + teams + day if present.
    const dayStart = new Date(fixture.kickoff);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const existingMatch = await db.match.findFirst({
      where: { seasonId, homeTeamId, awayTeamId, kickoff: { gte: dayStart, lt: dayEnd } },
    });
    const match =
      existingMatch ??
      (await db.match.create({
        data: { seasonId, homeTeamId, awayTeamId, kickoff: fixture.kickoff },
      }));

    await db.providerIdMap.create({
      data: {
        sourceId: fixture.sourceId,
        entityType: "MATCH",
        nativeId: fixture.nativeMatchId,
        canonicalId: match.id,
        confidence: 1,
      },
    });

    return { matchId: match.id, homeTeamId, awayTeamId };
  }

  async saveStatValue(obs: {
    matchId: string;
    statTypeId: string;
    teamId: string;
    sourceId: string;
    value: number;
    weightAtIngest: number;
  }): Promise<void> {
    const existing = await db.statValue.findFirst({
      where: {
        matchId: obs.matchId,
        statTypeId: obs.statTypeId,
        teamId: obs.teamId,
        playerId: null,
        sourceId: obs.sourceId,
      },
    });
    if (existing) {
      await db.statValue.update({
        where: { id: existing.id },
        data: { value: obs.value, weightAtIngest: obs.weightAtIngest, ingestedAt: new Date() },
      });
    } else {
      await db.statValue.create({
        data: {
          matchId: obs.matchId,
          statTypeId: obs.statTypeId,
          teamId: obs.teamId,
          sourceId: obs.sourceId,
          value: obs.value,
          weightAtIngest: obs.weightAtIngest,
        },
      });
    }
  }

  async saveConsensus(c: {
    matchId: string;
    statTypeId: string;
    teamId: string;
    value: number;
    variance: number;
    contributors: Array<{ sourceId: string; value: number; weight: number }>;
  }): Promise<void> {
    const existing = await db.consensusValue.findFirst({
      where: { matchId: c.matchId, statTypeId: c.statTypeId, teamId: c.teamId, playerId: null },
    });
    const data = {
      value: c.value,
      variance: c.variance,
      contributors: c.contributors,
      computedAt: new Date(),
    };
    if (existing) {
      await db.consensusValue.update({ where: { id: existing.id }, data });
    } else {
      await db.consensusValue.create({
        data: {
          matchId: c.matchId,
          statTypeId: c.statTypeId,
          teamId: c.teamId,
          ...data,
        },
      });
    }
  }
}
