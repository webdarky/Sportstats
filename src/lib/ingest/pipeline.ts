import { aggregateMatch } from "../consensus/aggregate";
import { priorWeight } from "../consensus/weights";
import type { ProviderAdapter, RawStatObservation } from "../providers/types";
import type { RawObservation } from "../stats/types";

/**
 * Ingestion pipeline (blueprint Part 3). Orchestrates the flow:
 *
 *   adapters --> entity resolution --> raw StatValue persistence
 *            --> consensus recompute --> ConsensusValue persistence
 *
 * Persistence and entity resolution are abstracted behind `IngestRepository`
 * so the orchestration is unit-testable with an in-memory fake, and swaps to
 * Prisma in production (see prisma-repository.ts).
 */

export interface ResolvedMatch {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
}

export interface IngestRepository {
  /** Resolve (or create) the canonical match for a provider's fixture. */
  resolveMatch(fixture: {
    sourceId: string;
    nativeMatchId: string;
    kickoff: Date;
    competition: string;
    homeTeam: { nativeId: string; name: string };
    awayTeam: { nativeId: string; name: string };
  }): Promise<ResolvedMatch>;

  /** Resolve a provider's native team id to our canonical team id. */
  resolveTeam(input: {
    sourceId: string;
    nativeId: string;
    name: string;
  }): Promise<string>;

  /** Persist one raw per-source observation. */
  saveStatValue(obs: {
    matchId: string;
    statTypeId: string;
    teamId: string;
    sourceId: string;
    value: number;
    weightAtIngest: number;
  }): Promise<void>;

  /** Upsert the reconciled consensus value for a (match, stat, team). */
  saveConsensus(c: {
    matchId: string;
    statTypeId: string;
    teamId: string;
    value: number;
    variance: number;
    contributors: Array<{ sourceId: string; value: number; weight: number }>;
  }): Promise<void>;
}

export interface IngestWindow {
  competition: string;
  from: Date;
  to: Date;
}

export interface IngestReport {
  fixtures: number;
  observations: number;
  consensusValues: number;
  bySource: Record<string, number>;
  errors: string[];
}

export async function runIngestion(
  adapters: ProviderAdapter[],
  repo: IngestRepository,
  window: IngestWindow,
): Promise<IngestReport> {
  const report: IngestReport = {
    fixtures: 0,
    observations: 0,
    consensusValues: 0,
    bySource: {},
    errors: [],
  };

  const configured = adapters.filter((a) => a.isConfigured());

  // Accumulate raw observations per canonical match for the consensus pass.
  const perMatch = new Map<string, RawObservation[]>();

  for (const adapter of configured) {
    let fixtures;
    try {
      fixtures = await adapter.listFixtures(window);
    } catch (err) {
      report.errors.push(`${adapter.id} listFixtures: ${String(err)}`);
      continue;
    }

    for (const fixture of fixtures) {
      let resolved: ResolvedMatch;
      try {
        resolved = await repo.resolveMatch({
          sourceId: adapter.id,
          nativeMatchId: fixture.nativeMatchId,
          kickoff: fixture.kickoff,
          competition: window.competition,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
        });
      } catch (err) {
        report.errors.push(`${adapter.id} resolveMatch: ${String(err)}`);
        continue;
      }
      report.fixtures++;

      let stats: RawStatObservation[];
      try {
        stats = await adapter.fetchMatchStats(fixture.nativeMatchId);
      } catch (err) {
        report.errors.push(`${adapter.id} fetchMatchStats: ${String(err)}`);
        continue;
      }

      const weight = priorWeight(adapter.id);
      for (const obs of stats) {
        if (obs.subject.kind !== "team") continue; // player stats: future work
        const teamId = await repo.resolveTeam({
          sourceId: adapter.id,
          nativeId: obs.subject.nativeId,
          name: obs.subject.name,
        });

        await repo.saveStatValue({
          matchId: resolved.matchId,
          statTypeId: obs.statTypeId,
          teamId,
          sourceId: adapter.id,
          value: obs.value,
          weightAtIngest: weight,
        });
        report.observations++;
        report.bySource[adapter.id] = (report.bySource[adapter.id] ?? 0) + 1;

        const bucket = perMatch.get(resolved.matchId) ?? [];
        bucket.push({ statTypeId: obs.statTypeId, teamId, sourceId: adapter.id, value: obs.value });
        perMatch.set(resolved.matchId, bucket);
      }
    }
  }

  // Consensus pass: recompute per match now that all sources are in.
  for (const [matchId, observations] of perMatch) {
    const consensus = aggregateMatch(matchId, observations);
    for (const c of consensus) {
      await repo.saveConsensus(c);
      report.consensusValues++;
    }
  }

  return report;
}
