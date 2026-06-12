/**
 * Reputation priors for each data source, taken from the architecture
 * blueprint's master comparison table (Part 1). These are STARTING weights
 * only — the truth-discovery engine adjusts them dynamically against
 * consensus, and they should ultimately be replaced by empirically tracked
 * per-stat, per-league accuracy (see Caveats in the blueprint).
 */
export interface SourcePrior {
  id: string;
  name: string;
  tier: "FREE" | "SELF_SERVE" | "MID_TIER" | "ENTERPRISE" | "SCRAPED";
  /** Recommended reliability prior in [0, 1]. */
  weight: number;
  /**
   * Sources sharing an upstream feed are down-weighted together during copy
   * detection to avoid false corroboration (blueprint Part 2c.5).
   */
  upstreamGroup?: string;
}

export const SOURCE_PRIORS: Record<string, SourcePrior> = {
  opta: { id: "opta", name: "Stats Perform / Opta", tier: "ENTERPRISE", weight: 0.97 },
  sportradar: { id: "sportradar", name: "Sportradar", tier: "ENTERPRISE", weight: 0.96 },
  genius: { id: "genius", name: "Genius Sports", tier: "ENTERPRISE", weight: 0.95 },
  statsbomb: { id: "statsbomb", name: "StatsBomb (Hudl)", tier: "FREE", weight: 0.93 },
  wyscout: { id: "wyscout", name: "Wyscout (Hudl)", tier: "ENTERPRISE", weight: 0.88 },
  sportmonks: { id: "sportmonks", name: "Sportmonks", tier: "SELF_SERVE", weight: 0.85 },
  fbref: { id: "fbref", name: "FBref / Sports-Reference", tier: "SCRAPED", weight: 0.85 },
  betfair: { id: "betfair", name: "Betfair Exchange", tier: "MID_TIER", weight: 0.85 },
  understat: { id: "understat", name: "Understat", tier: "SCRAPED", weight: 0.82 },
  the_odds_api: { id: "the_odds_api", name: "The Odds API", tier: "SELF_SERVE", weight: 0.8 },
  transfermarkt: { id: "transfermarkt", name: "Transfermarkt", tier: "SCRAPED", weight: 0.8 },
  // WhoScored is Opta-derived — share an upstream group so copy detection can
  // discount it when Opta itself is also present.
  whoscored: { id: "whoscored", name: "WhoScored", tier: "SCRAPED", weight: 0.8, upstreamGroup: "opta" },
  api_football: { id: "api_football", name: "API-Football", tier: "SELF_SERVE", weight: 0.78 },
  football_data_org: { id: "football_data_org", name: "Football-Data.org", tier: "FREE", weight: 0.78 },
  fotmob: { id: "fotmob", name: "FotMob", tier: "SCRAPED", weight: 0.72 },
  sofascore: { id: "sofascore", name: "SofaScore", tier: "SCRAPED", weight: 0.7 },
  flashscore: { id: "flashscore", name: "Flashscore", tier: "SCRAPED", weight: 0.65 },
  thesportsdb: { id: "thesportsdb", name: "TheSportsDB", tier: "FREE", weight: 0.6 },
};

/** Look up a source's starting weight, defaulting low for unknown sources. */
export function priorWeight(sourceId: string): number {
  return SOURCE_PRIORS[sourceId]?.weight ?? 0.5;
}
