/**
 * Plain domain types shared by the aggregation pipeline, calculators, the
 * in-memory demo repository and the API layer. These are storage-agnostic: the
 * Prisma models persist them, but the math operates on these shapes so it can
 * be unit-tested without a database.
 */

export interface Team {
  id: string;
  name: string;
  shortName: string;
  competitionSlug: string;
}

export interface Competition {
  slug: string;
  name: string;
  sportSlug: string;
}

/** A raw, per-source observation of one stat for one team in one match. */
export interface RawObservation {
  statTypeId: string;
  teamId: string;
  sourceId: string;
  value: number;
}

export interface Match {
  id: string;
  competitionSlug: string;
  seasonLabel: string;
  round: string;
  /** ISO date string. */
  kickoff: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  observations: RawObservation[];
}

/** A reconciled (consensus) stat value for one team in one match. */
export interface ConsensusStat {
  matchId: string;
  statTypeId: string;
  teamId: string;
  value: number;
  variance: number;
  contributors: Array<{ sourceId: string; value: number; weight: number }>;
}
