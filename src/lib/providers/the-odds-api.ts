import { env } from "@/env";
import { requireNativeCompetitionId } from "./competitions";
import type {
  FixtureRef,
  ProviderAdapter,
  RawStatObservation,
} from "./types";

/**
 * The Odds API adapter — a Phase 1 self-serve source delivering odds-as-stats
 * from ~40 bookmakers. We surface the consensus (median) bookmaker line as a
 * stat so it can be reconciled alongside the on-pitch feeds. Note: this source
 * carries no event/box-score data, only markets, so it only emits odds-derived
 * observations.
 */
const BASE_URL = "https://api.the-odds-api.com/v4";

interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    markets: Array<{
      key: string;
      outcomes: Array<{ name: string; price: number; point?: number }>;
    }>;
  }>;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export class TheOddsApiAdapter implements ProviderAdapter {
  readonly id = "the_odds_api";

  isConfigured(): boolean {
    return Boolean(env.THE_ODDS_API_KEY);
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    if (!this.isConfigured()) throw new Error("THE_ODDS_API_KEY is not set");
    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("apiKey", env.THE_ODDS_API_KEY!);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`The Odds API ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  async listFixtures(params: {
    competition: string;
    from: Date;
    to: Date;
  }): Promise<FixtureRef[]> {
    const sportKey = requireNativeCompetitionId(params.competition, this.id);
    const events = await this.get<OddsEvent[]>(
      `/sports/${sportKey}/events`,
      {
        dateFormat: "iso",
        commenceTimeFrom: params.from.toISOString().replace(/\.\d+Z$/, "Z"),
        commenceTimeTo: params.to.toISOString().replace(/\.\d+Z$/, "Z"),
      },
    );

    return events.map((e) => ({
      sourceId: this.id,
      nativeMatchId: e.id,
      kickoff: new Date(e.commence_time),
      homeTeam: { nativeId: e.home_team, name: e.home_team },
      awayTeam: { nativeId: e.away_team, name: e.away_team },
    }));
  }

  async fetchMatchStats(nativeMatchId: string): Promise<RawStatObservation[]> {
    // `competition` is encoded into the event fetch via the odds endpoint; here
    // we read a single event's h2h market and emit the median implied result.
    const event = await this.get<OddsEvent>(
      `/sports/upcoming/events/${nativeMatchId}/odds`,
      { regions: "uk,eu", markets: "h2h", oddsFormat: "decimal" },
    );

    const homePrices: number[] = [];
    const awayPrices: number[] = [];
    for (const book of event.bookmakers) {
      const h2h = book.markets.find((m) => m.key === "h2h");
      if (!h2h) continue;
      for (const o of h2h.outcomes) {
        if (o.name === event.home_team) homePrices.push(o.price);
        else if (o.name === event.away_team) awayPrices.push(o.price);
      }
    }

    const observations: RawStatObservation[] = [];
    const homeMed = median(homePrices);
    const awayMed = median(awayPrices);

    // Convert decimal odds to an implied win probability (%) and store as a
    // stat so downstream consumers can compare market view vs. xG, etc.
    if (homeMed) {
      observations.push({
        sourceId: this.id,
        nativeMatchId,
        statTypeId: "win_probability",
        subject: {
          kind: "team",
          nativeId: event.home_team,
          name: event.home_team,
          block: { sport: "football" },
        },
        value: Math.round((1 / homeMed) * 1000) / 10,
      });
    }
    if (awayMed) {
      observations.push({
        sourceId: this.id,
        nativeMatchId,
        statTypeId: "win_probability",
        subject: {
          kind: "team",
          nativeId: event.away_team,
          name: event.away_team,
          block: { sport: "football" },
        },
        value: Math.round((1 / awayMed) * 1000) / 10,
      });
    }
    return observations;
  }
}
