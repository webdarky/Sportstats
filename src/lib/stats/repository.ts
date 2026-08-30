import { dataSource } from "@/env";
import { demoCompetitions, demoMatches, demoTeams, findTeam } from "../demo/dataset";
import type { Competition, Match, Team } from "./types";

/**
 * Read-side data source contract.
 *
 * Two implementations back it: the deterministic demo dataset (no
 * infrastructure required) and Postgres via Prisma (the live path, populated by
 * the ingestion pipeline). Both return the same domain shapes, so everything
 * downstream — consensus, calculators, API, UI — is identical in either mode.
 *
 * Note that `matchesForTeam` returns matches carrying their *raw per-source*
 * observations rather than pre-computed consensus. Consensus is then recomputed
 * on read by the calculators. That keeps exactly one consensus code path in the
 * product (the tested one) instead of a second, subtly-different SQL version,
 * and means a change to the weighting engine is reflected immediately rather
 * than requiring a backfill of every stored ConsensusValue.
 */

export type DataMode = "demo" | "postgres";

export interface MatchFilter {
  /** Only include matches on/after this ISO date. */
  since?: string;
  /** Restrict to a single competition slug. */
  competitionSlug?: string;
}

export interface StatsRepository {
  readonly mode: DataMode;
  listCompetitions(): Promise<Competition[]>;
  listTeams(competitionSlug?: string): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  /** Matches involving this team, with raw observations attached. */
  matchesForTeam(teamId: string, filter?: MatchFilter): Promise<Match[]>;
  /** Cheap liveness + population check, used by the health endpoint. */
  stats(): Promise<{ teams: number; matches: number }>;
}

// --- demo ---------------------------------------------------------------------

export class DemoStatsRepository implements StatsRepository {
  readonly mode = "demo" as const;

  async listCompetitions(): Promise<Competition[]> {
    return demoCompetitions;
  }

  async listTeams(competitionSlug?: string): Promise<Team[]> {
    return competitionSlug
      ? demoTeams.filter((t) => t.competitionSlug === competitionSlug)
      : demoTeams;
  }

  async getTeam(id: string): Promise<Team | undefined> {
    return findTeam(id);
  }

  async matchesForTeam(teamId: string, filter: MatchFilter = {}): Promise<Match[]> {
    return demoMatches.filter((m) => {
      if (m.homeTeamId !== teamId && m.awayTeamId !== teamId) return false;
      if (filter.competitionSlug && m.competitionSlug !== filter.competitionSlug) {
        return false;
      }
      if (filter.since && m.kickoff < filter.since) return false;
      return true;
    });
  }

  async stats(): Promise<{ teams: number; matches: number }> {
    return { teams: demoTeams.length, matches: demoMatches.length };
  }
}

// --- selection ----------------------------------------------------------------

export interface RepositoryResolution {
  repo: StatsRepository;
  /** The mode configuration asked for. */
  configured: DataMode;
  /** The mode actually serving requests (differs when Postgres is unreachable). */
  active: DataMode;
  /** Present when we fell back: why the configured source could not be used. */
  error?: string;
}

const CHECK_TTL_MS = 30_000;
let cached: { at: number; resolution: RepositoryResolution } | undefined;

/**
 * Pick the repository for this request.
 *
 * When Postgres is configured but unreachable we fall back to the demo dataset
 * rather than serving an error page — but the fallback is recorded in `active`
 * and `error` so the UI and /api/health can say so plainly. Serving demo
 * numbers while implying they are live would be worse than either alternative.
 * The probe result is cached briefly so a broken database does not add a failed
 * round-trip to every request.
 */
export async function resolveRepository(): Promise<RepositoryResolution> {
  const configured = dataSource();

  if (configured === "demo") {
    return { repo: new DemoStatsRepository(), configured, active: "demo" };
  }

  const now = Date.now();
  if (cached && now - cached.at < CHECK_TTL_MS) return cached.resolution;

  // Imported lazily so demo-mode deployments never pull in the Prisma client.
  const { PrismaStatsRepository } = await import("./prisma-repository");
  const repo = new PrismaStatsRepository();

  let resolution: RepositoryResolution;
  try {
    await repo.ping();
    resolution = { repo, configured, active: "postgres" };
  } catch (err) {
    resolution = {
      repo: new DemoStatsRepository(),
      configured,
      active: "demo",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  cached = { at: now, resolution };
  return resolution;
}

/** Drop the cached probe — used by tests and after ingestion runs. */
export function resetRepositoryCache(): void {
  cached = undefined;
}

export async function getRepository(): Promise<StatsRepository> {
  return (await resolveRepository()).repo;
}
