/**
 * Provider adapter contract. Every data source — self-serve API, free feed, or
 * (later) scraper — implements this interface so the ingestion layer treats
 * them uniformly. An adapter's job is narrow: fetch from the provider and emit
 * observations already mapped onto our canonical stat-type / entity ids. All
 * reconciliation (entity resolution, consensus) happens downstream.
 */
import type { BlockingKey } from "../entity-resolution/resolver";

/** A single raw stat observation, pre-consensus, tagged with its source. */
export interface RawStatObservation {
  sourceId: string;
  /** Provider-native match id; resolved to our Match via ProviderIdMap. */
  nativeMatchId: string;
  statTypeId: string; // canonical id from the stat dictionary
  subject:
    | { kind: "team"; nativeId: string; name: string; block: BlockingKey }
    | { kind: "player"; nativeId: string; name: string; block: BlockingKey };
  value: number;
}

export interface FixtureRef {
  sourceId: string;
  nativeMatchId: string;
  kickoff: Date;
  homeTeam: { nativeId: string; name: string };
  awayTeam: { nativeId: string; name: string };
}

export interface ProviderAdapter {
  /** Stable source id; must exist in SOURCE_PRIORS / the Source table. */
  readonly id: string;
  /** True when the adapter has the credentials it needs to run. */
  isConfigured(): boolean;
  /** List fixtures for a competition/date window. */
  listFixtures(params: {
    competition: string;
    from: Date;
    to: Date;
  }): Promise<FixtureRef[]>;
  /** Fetch all available stat observations for a single fixture. */
  fetchMatchStats(nativeMatchId: string): Promise<RawStatObservation[]>;
}
