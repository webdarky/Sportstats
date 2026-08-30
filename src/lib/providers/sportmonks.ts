import { env } from "@/env";
import { requireNativeCompetitionId } from "./competitions";
import type {
  FixtureRef,
  ProviderAdapter,
  RawStatObservation,
} from "./types";

/**
 * Sportmonks Football v3 adapter — the second *box-score* source.
 *
 * This is the adapter that makes the consensus engine do real work. API-Football
 * already supplies corners/cards/shots/possession; The Odds API supplies only
 * implied win probability, so it corroborates none of them. Sportmonks overlaps
 * API-Football almost stat-for-stat, so once both are configured every displayed
 * number has two independent observations to reconcile, and the disagreement
 * variance the UI reports becomes meaningful rather than structurally zero.
 *
 * Sportmonks identifies statistics by numeric `type_id`, not by label — unlike
 * API-Football, which sends human-readable names. The IDs below are from the
 * v3 fixture-statistics type reference. The docs explicitly advise against
 * requesting the `.type` include in production and recommend pinning the ids,
 * which is what this map does.
 */
const BASE_URL = "https://api.sportmonks.com/v3/football";

/**
 * Sportmonks fixture-statistic `type_id` -> our canonical stat id.
 * Unmapped ids are dropped. Sportmonks publishes no expected-goals figure on
 * fixture statistics, so `xg` stays API-Football-only.
 */
const STAT_TYPE_MAP: Record<number, string> = {
  34: "corners",
  41: "shots_off_target",
  42: "shots_total",
  45: "possession",
  49: "shots_inside_box",
  50: "shots_outside_box",
  51: "offsides",
  56: "fouls",
  57: "saves",
  58: "shots_blocked",
  80: "passes_total",
  81: "passes_accurate",
  82: "passes_pct",
  83: "red_cards",
  84: "yellow_cards",
  86: "shots_on_target",
};

/** Max pages to walk when listing fixtures, so a bad filter cannot spin. */
const MAX_PAGES = 10;

interface SportmonksParticipant {
  id: number;
  name: string;
  meta?: { location?: string };
}

interface SportmonksStatistic {
  type_id: number;
  participant_id: number;
  /** Sportmonks nests the figure under `data`, normally as `{ value: n }`. */
  data?: { value?: unknown } | null;
}

export interface SportmonksFixture {
  id: number;
  starting_at?: string | null;
  starting_at_timestamp?: number | null;
  participants?: SportmonksParticipant[];
  statistics?: SportmonksStatistic[];
}

/** Sportmonks sends numbers as numbers, but percentages sometimes as strings. */
function parseValue(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const n = Number(raw.replace("%", "").trim());
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function kickoffOf(fixture: SportmonksFixture): Date | null {
  if (typeof fixture.starting_at_timestamp === "number") {
    return new Date(fixture.starting_at_timestamp * 1000);
  }
  if (fixture.starting_at) {
    // "2024-08-17 14:00:00" is UTC but lacks a zone designator, so spell it out
    // rather than letting the runtime guess local time.
    const iso = fixture.starting_at.includes("T")
      ? fixture.starting_at
      : `${fixture.starting_at.replace(" ", "T")}Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function sideOf(
  participants: SportmonksParticipant[],
  location: "home" | "away",
): SportmonksParticipant | undefined {
  return participants.find((p) => p.meta?.location === location);
}

/**
 * Map a page of fixtures onto the adapter contract. Fixtures missing a kickoff
 * or either participant are skipped rather than guessed at.
 */
export function parseFixtures(
  fixtures: SportmonksFixture[],
  sourceId: string,
): FixtureRef[] {
  const refs: FixtureRef[] = [];

  for (const fixture of fixtures) {
    const participants = fixture.participants ?? [];
    const home = sideOf(participants, "home");
    const away = sideOf(participants, "away");
    const kickoff = kickoffOf(fixture);
    if (!home || !away || !kickoff) continue;

    refs.push({
      sourceId,
      nativeMatchId: String(fixture.id),
      kickoff,
      homeTeam: { nativeId: String(home.id), name: home.name },
      awayTeam: { nativeId: String(away.id), name: away.name },
    });
  }

  return refs;
}

/**
 * Map one fixture's statistics onto canonical observations. Statistics carry a
 * `participant_id` but no team name, so names are resolved from the fixture's
 * participants; a statistic for an unknown participant is dropped.
 */
export function parseMatchStats(
  fixture: SportmonksFixture,
  sourceId: string,
  nativeMatchId: string,
): RawStatObservation[] {
  const nameById = new Map(
    (fixture.participants ?? []).map((p) => [p.id, p.name] as const),
  );

  const observations: RawStatObservation[] = [];
  for (const stat of fixture.statistics ?? []) {
    const statTypeId = STAT_TYPE_MAP[stat.type_id];
    if (!statTypeId) continue;

    const value = parseValue(stat.data?.value);
    if (value === null) continue;

    const name = nameById.get(stat.participant_id);
    if (!name) continue;

    observations.push({
      sourceId,
      nativeMatchId,
      statTypeId,
      subject: {
        kind: "team",
        nativeId: String(stat.participant_id),
        name,
        block: { sport: "football" },
      },
      value,
    });
  }

  return observations;
}

export class SportmonksAdapter implements ProviderAdapter {
  readonly id = "sportmonks";

  isConfigured(): boolean {
    return Boolean(env.SPORTMONKS_TOKEN);
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("SPORTMONKS_TOKEN is not set");
    }
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    // Token goes in the header, not the query string, so it stays out of logs
    // and proxy access records.
    const res = await fetch(url, {
      headers: { Authorization: env.SPORTMONKS_TOKEN! },
    });
    if (!res.ok) {
      throw new Error(`Sportmonks ${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async listFixtures(params: {
    competition: string;
    from: Date;
    to: Date;
  }): Promise<FixtureRef[]> {
    const league = requireNativeCompetitionId(params.competition, this.id);
    const from = params.from.toISOString().slice(0, 10);
    const to = params.to.toISOString().slice(0, 10);

    const all: FixtureRef[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await this.get<{
        data: SportmonksFixture[];
        pagination?: { has_more?: boolean };
      }>(`/fixtures/between/${from}/${to}`, {
        filters: `fixtureLeagues:${league}`,
        include: "participants",
        page: String(page),
      });

      all.push(...parseFixtures(body.data ?? [], this.id));
      if (!body.pagination?.has_more) break;
    }

    return all;
  }

  async fetchMatchStats(nativeMatchId: string): Promise<RawStatObservation[]> {
    const body = await this.get<{ data: SportmonksFixture }>(
      `/fixtures/${nativeMatchId}`,
      { include: "statistics;participants" },
    );
    if (!body.data) return [];
    return parseMatchStats(body.data, this.id, nativeMatchId);
  }
}
