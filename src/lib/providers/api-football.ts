import { env } from "@/env";
import type {
  FixtureRef,
  ProviderAdapter,
  RawStatObservation,
} from "./types";

/**
 * API-Football (api-sports.io) adapter — a Phase 1 self-serve source.
 * Maps the 16 documented `fixtures/statistics` team types (+ expected_goals)
 * onto our canonical stat dictionary. Football block: country comes from the
 * league context the caller already knows; we tag what we can.
 */
const BASE_URL = "https://v3.football.api-sports.io";

/** Provider stat label -> canonical stat id. Unmapped labels are dropped. */
const STAT_MAP: Record<string, string> = {
  "Total Shots": "shots_total",
  "Shots on Goal": "shots_on_target",
  "Shots off Goal": "shots_off_target",
  "Blocked Shots": "shots_blocked",
  "Shots insidebox": "shots_inside_box",
  "Shots outsidebox": "shots_outside_box",
  "Corner Kicks": "corners",
  Offsides: "offsides",
  Fouls: "fouls",
  "Ball Possession": "possession",
  "Yellow Cards": "yellow_cards",
  "Red Cards": "red_cards",
  "Goalkeeper Saves": "saves",
  "Total passes": "passes_total",
  "Passes accurate": "passes_accurate",
  "Passes %": "passes_pct",
  expected_goals: "xg",
};

/** "53%" -> 53, "1.8" -> 1.8, null -> null. */
function parseStatValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const cleaned = raw.replace("%", "").trim();
    const n = Number(cleaned);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export class ApiFootballAdapter implements ProviderAdapter {
  readonly id = "api_football";

  isConfigured(): boolean {
    return Boolean(env.API_FOOTBALL_KEY);
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("API_FOOTBALL_KEY is not set");
    }
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url, {
      headers: { "x-apisports-key": env.API_FOOTBALL_KEY! },
    });
    if (!res.ok) {
      throw new Error(`API-Football ${path} failed: ${res.status}`);
    }
    const body = (await res.json()) as { response: T; errors?: unknown };
    return body.response;
  }

  async listFixtures(params: {
    competition: string;
    from: Date;
    to: Date;
  }): Promise<FixtureRef[]> {
    type ApiFixture = {
      fixture: { id: number; date: string };
      teams: { home: { id: number; name: string }; away: { id: number; name: string } };
    };
    const response = await this.get<ApiFixture[]>("/fixtures", {
      league: params.competition,
      from: params.from.toISOString().slice(0, 10),
      to: params.to.toISOString().slice(0, 10),
    });

    return response.map((f) => ({
      sourceId: this.id,
      nativeMatchId: String(f.fixture.id),
      kickoff: new Date(f.fixture.date),
      homeTeam: { nativeId: String(f.teams.home.id), name: f.teams.home.name },
      awayTeam: { nativeId: String(f.teams.away.id), name: f.teams.away.name },
    }));
  }

  async fetchMatchStats(nativeMatchId: string): Promise<RawStatObservation[]> {
    type TeamStats = {
      team: { id: number; name: string };
      statistics: Array<{ type: string; value: unknown }>;
    };
    const response = await this.get<TeamStats[]>("/fixtures/statistics", {
      fixture: nativeMatchId,
    });

    const observations: RawStatObservation[] = [];
    for (const team of response) {
      for (const stat of team.statistics) {
        const statTypeId = STAT_MAP[stat.type];
        if (!statTypeId) continue;
        const value = parseStatValue(stat.value);
        if (value === null) continue;

        observations.push({
          sourceId: this.id,
          nativeMatchId,
          statTypeId,
          subject: {
            kind: "team",
            nativeId: String(team.team.id),
            name: team.team.name,
            block: { sport: "football" },
          },
          value,
        });
      }
    }
    return observations;
  }
}
