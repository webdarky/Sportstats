import { test } from "node:test";
import assert from "node:assert/strict";
import { runIngestion, type IngestRepository, type ResolvedMatch } from "./pipeline";
import type { ProviderAdapter, RawStatObservation } from "../providers/types";

// --- in-memory fakes ---------------------------------------------------------

class FakeRepo implements IngestRepository {
  teams = new Map<string, string>(); // nativeId -> canonicalId
  statValues: Array<{ sourceId: string; statTypeId: string; teamId: string; value: number }> = [];
  consensus: Array<{ statTypeId: string; teamId: string; value: number }> = [];

  async resolveMatch(f: {
    homeTeam: { nativeId: string };
    awayTeam: { nativeId: string };
    nativeMatchId: string;
  }): Promise<ResolvedMatch> {
    return {
      matchId: `canon-${f.nativeMatchId}`,
      homeTeamId: await this.resolveTeam({ sourceId: "", nativeId: f.homeTeam.nativeId, name: "" }),
      awayTeamId: await this.resolveTeam({ sourceId: "", nativeId: f.awayTeam.nativeId, name: "" }),
    };
  }
  async resolveTeam(i: { sourceId: string; nativeId: string; name: string }): Promise<string> {
    // Two providers use different native ids for the same canonical team.
    const canon = i.nativeId.replace(/^(af|odds)-/, "");
    this.teams.set(i.nativeId, canon);
    return canon;
  }
  async saveStatValue(o: { sourceId: string; statTypeId: string; teamId: string; value: number }) {
    this.statValues.push(o);
  }
  async saveConsensus(c: { statTypeId: string; teamId: string; value: number }) {
    this.consensus.push({ statTypeId: c.statTypeId, teamId: c.teamId, value: c.value });
  }
}

function fakeAdapter(id: string, value: number): ProviderAdapter {
  const prefix = id === "api_football" ? "af" : "odds";
  return {
    id,
    isConfigured: () => true,
    async listFixtures() {
      return [
        {
          sourceId: id,
          nativeMatchId: "1",
          kickoff: new Date("2024-08-17T14:00:00Z"),
          homeTeam: { nativeId: `${prefix}-arsenal`, name: "Arsenal" },
          awayTeam: { nativeId: `${prefix}-chelsea`, name: "Chelsea" },
        },
      ];
    },
    async fetchMatchStats(): Promise<RawStatObservation[]> {
      return [
        {
          sourceId: id,
          nativeMatchId: "1",
          statTypeId: "corners",
          subject: { kind: "team", nativeId: `${prefix}-arsenal`, name: "Arsenal", block: { sport: "football" } },
          value,
        },
      ];
    },
  };
}

test("pipeline merges two sources into one canonical match + consensus", async () => {
  const repo = new FakeRepo();
  const report = await runIngestion(
    [fakeAdapter("api_football", 6), fakeAdapter("the_odds_api", 8)],
    repo,
    { competition: "england-premier-league", from: new Date(), to: new Date() },
  );

  // Both sources persisted a raw observation for the same canonical team.
  assert.equal(report.observations, 2);
  assert.equal(repo.statValues.length, 2);
  assert.deepEqual(
    [...new Set(repo.statValues.map((s) => s.teamId))],
    ["arsenal"],
    "both providers' native ids resolved to one canonical team",
  );

  // Exactly one consensus value for (corners, arsenal), between the two inputs.
  assert.equal(repo.consensus.length, 1);
  const c = repo.consensus[0]!;
  assert.equal(c.teamId, "arsenal");
  assert.ok(c.value >= 6 && c.value <= 8, `consensus ${c.value} should sit between 6 and 8`);
});

test("pipeline skips unconfigured adapters", async () => {
  const repo = new FakeRepo();
  const off: ProviderAdapter = { ...fakeAdapter("api_football", 6), isConfigured: () => false };
  const report = await runIngestion([off], repo, {
    competition: "x",
    from: new Date(),
    to: new Date(),
  });
  assert.equal(report.observations, 0);
});
