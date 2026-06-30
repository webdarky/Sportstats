import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTeamStatGames, summarize, timeframeToSince } from "./calculators";
import { demoMatches } from "../demo/dataset";

test("buildTeamStatGames returns one game per Arsenal fixture", () => {
  const games = buildTeamStatGames(demoMatches, "arsenal", "corners");
  // 6 teams, single round-robin => each team plays 10 games (5 home, 5 away).
  assert.equal(games.length, 10);
  assert.equal(games.filter((g) => g.isHome).length, 5);
});

test("summary calculators are internally consistent", () => {
  const games = buildTeamStatGames(demoMatches, "arsenal", "corners");
  const s = summarize(games);

  assert.equal(s.games, 10);
  // averagePerGame * games ~= totalAllTime (within rounding).
  assert.ok(Math.abs(s.averagePerGame * s.games - s.totalAllTime) < 0.2);
  // combined (both teams) must be >= the team's own average.
  assert.ok(s.combinedAveragePerGame >= s.averagePerGame);
  // distribution counts sum to the number of games.
  assert.equal(s.distribution.reduce((a, d) => a + d.count, 0), s.games);
  // trend is time-ordered.
  for (let i = 1; i < s.trend.length; i++) {
    assert.ok(s.trend[i]!.kickoff >= s.trend[i - 1]!.kickoff);
  }
});

test("consensus pulls corners near Man City's profiled baseline (~7.4)", () => {
  const games = buildTeamStatGames(demoMatches, "man-city", "corners");
  const s = summarize(games);
  assert.ok(
    s.averagePerGame > 5.5 && s.averagePerGame < 9,
    `expected ~7.4, got ${s.averagePerGame}`,
  );
});

test("competition filter excludes unknown competitions", () => {
  const games = buildTeamStatGames(demoMatches, "arsenal", "corners", {
    competitionSlug: "does-not-exist",
  });
  assert.equal(games.length, 0);
});

test("timeframeToSince computes a cutoff for bounded windows", () => {
  const now = new Date("2025-01-01T00:00:00.000Z");
  assert.equal(timeframeToSince("all", now), undefined);
  const since6m = timeframeToSince("6m", now);
  assert.ok(since6m && since6m.startsWith("2024-07"));
});
