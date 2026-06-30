import { jaroWinkler, normalizeName } from "../entity-resolution/jaro-winkler";
import { STAT_TYPES, STAT_TYPE_BY_ID } from "../stat-types/dictionary";
import { demoCompetitions, demoMatches, demoTeams, findTeam } from "../demo/dataset";
import {
  buildTeamStatGames,
  summarize,
  timeframeToSince,
  type StatSummary,
} from "./calculators";
import type { Competition, Team } from "./types";

/**
 * Read-side query layer powering the API and UI. Currently backed by the
 * deterministic demo dataset; swap the data source for the Prisma read models
 * once a database is connected — the function signatures stay the same.
 */

export interface SearchResult {
  team: Team;
  competition: Competition | undefined;
  score: number;
  /** A stat id detected in the query (e.g. "Arsenal corners" -> "corners"). */
  detectedStat?: string;
}

const STAT_KEYWORDS: Array<{ id: string; words: string[] }> = STAT_TYPES.map((s) => ({
  id: s.id,
  words: [s.id.replace(/_/g, " "), s.name.toLowerCase()],
}));

/** Detect a stat the user typed alongside a team name. */
export function detectStat(query: string): string | undefined {
  const q = normalizeName(query);
  for (const { id, words } of STAT_KEYWORDS) {
    if (words.some((w) => q.includes(normalizeName(w)))) return id;
  }
  return undefined;
}

/** Fuzzy search teams (the primary entry point from the blueprint's search bar). */
export function searchTeams(query: string, limit = 8): SearchResult[] {
  const detectedStat = detectStat(query);
  // Strip the detected stat words so "arsenal corners" still matches "arsenal".
  let teamQuery = normalizeName(query);
  if (detectedStat) {
    for (const w of STAT_TYPE_BY_ID.get(detectedStat)?.name.toLowerCase().split(" ") ?? []) {
      teamQuery = teamQuery.replace(normalizeName(w), "").trim();
    }
    teamQuery = teamQuery.replace(detectedStat.replace(/_/g, " "), "").trim();
  }

  const compBySlug = new Map(demoCompetitions.map((c) => [c.slug, c]));

  const ranked = demoTeams
    .map((team) => {
      const name = normalizeName(team.name);
      const short = normalizeName(team.shortName);
      // Substring match is a strong signal; otherwise fall back to similarity.
      const substr = teamQuery && (name.includes(teamQuery) || short === teamQuery);
      const score = substr ? 1 : jaroWinkler(teamQuery, name);
      return {
        team,
        competition: compBySlug.get(team.competitionSlug),
        score,
        detectedStat,
      };
    })
    .filter((r) => r.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked;
}

export function listCompetitions(): Competition[] {
  return demoCompetitions;
}

export function listTeams(competitionSlug?: string): Team[] {
  return competitionSlug
    ? demoTeams.filter((t) => t.competitionSlug === competitionSlug)
    : demoTeams;
}

export function getTeam(id: string): Team | undefined {
  return findTeam(id);
}

export interface TeamStatResult {
  team: Team;
  statTypeId: string;
  statName: string;
  timeframe: string;
  competitionSlug?: string;
  summary: StatSummary;
}

/** The full dashboard payload for a team + stat (blueprint Part 4). */
export function getTeamStat(params: {
  teamId: string;
  statTypeId: string;
  timeframe?: string;
  competitionSlug?: string;
  now?: Date;
}): TeamStatResult | null {
  const team = findTeam(params.teamId);
  if (!team) return null;
  const statDef = STAT_TYPE_BY_ID.get(params.statTypeId);
  if (!statDef) return null;

  const timeframe = params.timeframe ?? "all";
  const since = timeframeToSince(timeframe, params.now ?? new Date());
  const games = buildTeamStatGames(demoMatches, params.teamId, params.statTypeId, {
    since,
    competitionSlug: params.competitionSlug,
  });

  return {
    team,
    statTypeId: params.statTypeId,
    statName: statDef.name,
    timeframe,
    competitionSlug: params.competitionSlug,
    summary: summarize(games),
  };
}

/** Stats that have demo coverage, for populating UI selectors. */
export const SUPPORTED_STATS = [
  "corners",
  "yellow_cards",
  "shots_total",
  "shots_on_target",
  "possession",
] as const;
