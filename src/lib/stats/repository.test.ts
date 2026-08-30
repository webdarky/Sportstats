import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoStatsRepository, type StatsRepository } from "./repository";
import { rankTeams, detectStat } from "./query";
import { buildTeamStatGames, summarize } from "./calculators";
import { demoMatches, demoTeams } from "../demo/dataset";
import type { Match } from "./types";

/**
 * A stand-in for the Postgres repository that serves the same demo fixtures.
 * It exists to prove the *contract* is source-agnostic: anything reading
 * through StatsRepository must produce identical results regardless of which
 * implementation is underneath. The real Prisma repository is exercised against
 * a live database; what is testable without one is that the seam holds.
 */
class FakeRemoteRepository implements StatsRepository {
  readonly mode = "postgres" as const;
  constructor(private readonly matches: Match[]) {}

  async listCompetitions() {
    return [
      { slug: "england-premier-league", name: "Premier League", sportSlug: "football" },
    ];
  }
  async listTeams(competitionSlug?: string) {
    return competitionSlug
      ? demoTeams.filter((t) => t.competitionSlug === competitionSlug)
      : demoTeams;
  }
  async getTeam(id: string) {
    return demoTeams.find((t) => t.id === id);
  }
  async matchesForTeam(teamId: string) {
    return this.matches.filter(
      (m) => m.homeTeamId === teamId || m.awayTeamId === teamId,
    );
  }
  async stats() {
    return { teams: demoTeams.length, matches: this.matches.length };
  }
}

test("demo repository satisfies the read contract", async () => {
  const repo = new DemoStatsRepository();

  assert.equal(repo.mode, "demo");
  assert.ok((await repo.listCompetitions()).length > 0);
  assert.equal((await repo.getTeam("arsenal"))?.name, "Arsenal");
  assert.equal(await repo.getTeam("does-not-exist"), undefined);

  const counts = await repo.stats();
  assert.equal(counts.teams, demoTeams.length);
  assert.equal(counts.matches, demoMatches.length);
});

test("demo repository filters matches by team and competition", async () => {
  const repo = new DemoStatsRepository();

  const arsenal = await repo.matchesForTeam("arsenal");
  assert.equal(arsenal.length, 10);
  for (const m of arsenal) {
    assert.ok(m.homeTeamId === "arsenal" || m.awayTeamId === "arsenal");
  }

  const wrongComp = await repo.matchesForTeam("arsenal", {
    competitionSlug: "spain-la-liga",
  });
  assert.equal(wrongComp.length, 0);
});

test("demo repository honours the `since` cutoff", async () => {
  const repo = new DemoStatsRepository();
  const all = await repo.matchesForTeam("arsenal");
  const cutoff = all[5]!.kickoff;

  const recent = await repo.matchesForTeam("arsenal", { since: cutoff });
  assert.ok(recent.length < all.length);
  for (const m of recent) assert.ok(m.kickoff >= cutoff);
});

test("both repository implementations yield identical summaries", async () => {
  const demo = new DemoStatsRepository();
  const remote = new FakeRemoteRepository(demoMatches);

  for (const statTypeId of ["corners", "yellow_cards", "possession"]) {
    const fromDemo = summarize(
      buildTeamStatGames(await demo.matchesForTeam("arsenal"), "arsenal", statTypeId),
    );
    const fromRemote = summarize(
      buildTeamStatGames(await remote.matchesForTeam("arsenal"), "arsenal", statTypeId),
    );
    assert.deepEqual(
      fromRemote,
      fromDemo,
      `${statTypeId} differed across repository implementations`,
    );
  }
});

test("rankTeams matches on name, short name and fuzzy spelling", async () => {
  const repo = new DemoStatsRepository();
  const teams = await repo.listTeams();
  const competitions = await repo.listCompetitions();

  const exact = rankTeams("arsenal", teams, competitions);
  assert.equal(exact[0]?.team.id, "arsenal");

  const short = rankTeams("MCI", teams, competitions);
  assert.equal(short[0]?.team.id, "man-city");

  const typo = rankTeams("liverpol", teams, competitions);
  assert.equal(typo[0]?.team.id, "liverpool");
});

test("rankTeams strips a detected stat from the team portion", async () => {
  const repo = new DemoStatsRepository();
  const teams = await repo.listTeams();
  const competitions = await repo.listCompetitions();

  assert.equal(detectStat("arsenal corners"), "corners");

  const results = rankTeams("arsenal corners", teams, competitions);
  assert.equal(results[0]?.team.id, "arsenal");
  assert.equal(results[0]?.detectedStat, "corners");
});

test("rankTeams attaches the team's competition", async () => {
  const repo = new DemoStatsRepository();
  const results = rankTeams(
    "arsenal",
    await repo.listTeams(),
    await repo.listCompetitions(),
  );
  assert.equal(results[0]?.competition?.name, "Premier League");
});
