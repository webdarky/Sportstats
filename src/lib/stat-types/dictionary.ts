/**
 * Canonical stat-type dictionary — our SUPERSET of the Opta, Sportmonks and
 * API-Football taxonomies (blueprint Part 2b). Each provider adapter maps its
 * native stat identifiers onto these canonical ids so the consensus engine
 * compares like with like.
 *
 * `isContinuous` drives which consensus function applies: weighted mean for
 * continuous quantities, weighted plurality for categorical facts.
 */
export interface StatTypeDef {
  id: string;
  name: string;
  unit: "count" | "percent" | "xg" | "rating" | "boolean";
  isContinuous: boolean;
}

export const STAT_TYPES: StatTypeDef[] = [
  // Football team-level (maps to API-Football's 16 fixture types + xG).
  { id: "shots_total", name: "Total Shots", unit: "count", isContinuous: true },
  { id: "shots_on_target", name: "Shots on Goal", unit: "count", isContinuous: true },
  { id: "shots_off_target", name: "Shots off Goal", unit: "count", isContinuous: true },
  { id: "shots_blocked", name: "Blocked Shots", unit: "count", isContinuous: true },
  { id: "shots_inside_box", name: "Shots Inside Box", unit: "count", isContinuous: true },
  { id: "shots_outside_box", name: "Shots Outside Box", unit: "count", isContinuous: true },
  { id: "corners", name: "Corner Kicks", unit: "count", isContinuous: true },
  { id: "offsides", name: "Offsides", unit: "count", isContinuous: true },
  { id: "fouls", name: "Fouls", unit: "count", isContinuous: true },
  { id: "possession", name: "Ball Possession", unit: "percent", isContinuous: true },
  { id: "yellow_cards", name: "Yellow Cards", unit: "count", isContinuous: true },
  { id: "red_cards", name: "Red Cards", unit: "count", isContinuous: true },
  { id: "saves", name: "Goalkeeper Saves", unit: "count", isContinuous: true },
  { id: "passes_total", name: "Total Passes", unit: "count", isContinuous: true },
  { id: "passes_accurate", name: "Accurate Passes", unit: "count", isContinuous: true },
  { id: "passes_pct", name: "Pass Accuracy", unit: "percent", isContinuous: true },
  { id: "xg", name: "Expected Goals", unit: "xg", isContinuous: true },

  // Player-level extras (API-Football / Sportmonks / Understat).
  { id: "goals", name: "Goals", unit: "count", isContinuous: true },
  { id: "assists", name: "Assists", unit: "count", isContinuous: true },
  { id: "key_passes", name: "Key Passes", unit: "count", isContinuous: true },
  { id: "tackles", name: "Tackles", unit: "count", isContinuous: true },
  { id: "interceptions", name: "Interceptions", unit: "count", isContinuous: true },
  { id: "duels_won", name: "Duels Won", unit: "count", isContinuous: true },
  { id: "rating", name: "Player Rating", unit: "rating", isContinuous: true },

  // Categorical facts resolved by weighted plurality.
  { id: "goal_scorer", name: "Goal Scorer", unit: "boolean", isContinuous: false },
  { id: "result", name: "Match Result", unit: "boolean", isContinuous: false },
];

export const STAT_TYPE_BY_ID = new Map(STAT_TYPES.map((s) => [s.id, s]));

export function isContinuousStat(id: string): boolean {
  return STAT_TYPE_BY_ID.get(id)?.isContinuous ?? true;
}
