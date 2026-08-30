import { jaroWinkler, normalizeName } from "../entity-resolution/jaro-winkler";
import { STAT_TYPES, STAT_TYPE_BY_ID } from "../stat-types/dictionary";
import {
  buildTeamStatGames,
  summarize,
  timeframeToSince,
  type StatSummary,
} from "./calculators";
import { getRepository, resolveRepository, type DataMode } from "./repository";
import type { Competition, Team } from "./types";

/**
 * Read-side query layer powering the API and UI. It is source-agnostic: the
 * repository underneath is either the demo dataset or Postgres, chosen by
 * configuration (see repository.ts). Callers get the same shapes either way.
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

/** Strip detected stat words so "arsenal corners" still matches "arsenal". */
function teamPortionOf(query: string, detectedStat: string | undefined): string {
  let teamQuery = normalizeName(query);
  if (!detectedStat) return teamQuery;

  const statName = STAT_TYPE_BY_ID.get(detectedStat)?.name.toLowerCase() ?? "";
  for (const w of statName.split(" ")) {
    teamQuery = teamQuery.replace(normalizeName(w), "").trim();
  }
  return teamQuery.replace(detectedStat.replace(/_/g, " "), "").trim();
}

/**
 * Rank teams against a query. Pure, so it can be unit-tested against a fixed
 * team list without a repository.
 */
export function rankTeams(
  query: string,
  teams: Team[],
  competitions: Competition[],
  limit = 8,
): SearchResult[] {
  const detectedStat = detectStat(query);
  const teamQuery = teamPortionOf(query, detectedStat);
  const compBySlug = new Map(competitions.map((c) => [c.slug, c]));

  return teams
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
}

/** Fuzzy search teams (the primary entry point from the blueprint's search bar). */
export async function searchTeams(query: string, limit = 8): Promise<SearchResult[]> {
  const repo = await getRepository();
  const [teams, competitions] = await Promise.all([
    repo.listTeams(),
    repo.listCompetitions(),
  ]);
  return rankTeams(query, teams, competitions, limit);
}

export async function listCompetitions(): Promise<Competition[]> {
  return (await getRepository()).listCompetitions();
}

export async function listTeams(competitionSlug?: string): Promise<Team[]> {
  return (await getRepository()).listTeams(competitionSlug);
}

export async function getTeam(id: string): Promise<Team | undefined> {
  return (await getRepository()).getTeam(id);
}

export interface TeamStatResult {
  team: Team;
  statTypeId: string;
  statName: string;
  timeframe: string;
  competitionSlug?: string;
  summary: StatSummary;
  /** Which source actually served this payload. */
  dataMode: DataMode;
}

/** The full dashboard payload for a team + stat (blueprint Part 4). */
export async function getTeamStat(params: {
  teamId: string;
  statTypeId: string;
  timeframe?: string;
  competitionSlug?: string;
  now?: Date;
}): Promise<TeamStatResult | null> {
  const { repo, active } = await resolveRepository();

  const team = await repo.getTeam(params.teamId);
  if (!team) return null;
  const statDef = STAT_TYPE_BY_ID.get(params.statTypeId);
  if (!statDef) return null;

  const timeframe = params.timeframe ?? "all";
  const since = timeframeToSince(timeframe, params.now ?? new Date());
  const matches = await repo.matchesForTeam(params.teamId, {
    since,
    competitionSlug: params.competitionSlug,
  });

  const games = buildTeamStatGames(matches, params.teamId, params.statTypeId, {
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
    dataMode: active,
  };
}

/** Stats the UI offers selectors for. */
export const SUPPORTED_STATS = [
  "corners",
  "yellow_cards",
  "shots_total",
  "shots_on_target",
  "possession",
] as const;
