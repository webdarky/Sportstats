import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFixtures,
  parseMatchStats,
  type SportmonksFixture,
} from "./sportmonks";
import { aggregateMatch } from "../consensus/aggregate";
import type { RawObservation } from "../stats/types";

/**
 * Payloads mirror the documented v3 shape: participants carry `meta.location`,
 * statistics carry a numeric `type_id` plus `data.value`.
 */
const FIXTURE: SportmonksFixture = {
  id: 19134500,
  starting_at: "2024-08-17 14:00:00",
  participants: [
    { id: 19, name: "Arsenal", meta: { location: "home" } },
    { id: 9, name: "Manchester City", meta: { location: "away" } },
  ],
  statistics: [
    { type_id: 34, participant_id: 19, data: { value: 7 } }, // corners
    { type_id: 34, participant_id: 9, data: { value: 5 } },
    { type_id: 84, participant_id: 19, data: { value: 2 } }, // yellow cards
    { type_id: 42, participant_id: 19, data: { value: 14 } }, // shots total
    { type_id: 86, participant_id: 19, data: { value: 6 } }, // shots on target
    { type_id: 45, participant_id: 19, data: { value: "58%" } }, // possession
    { type_id: 9999, participant_id: 19, data: { value: 1 } }, // unmapped
    { type_id: 34, participant_id: 4242, data: { value: 3 } }, // unknown team
    { type_id: 56, participant_id: 19, data: { value: null } }, // no value
  ],
};

test("parseFixtures maps participants by home/away location", () => {
  const refs = parseFixtures([FIXTURE], "sportmonks");

  assert.equal(refs.length, 1);
  const ref = refs[0]!;
  assert.equal(ref.sourceId, "sportmonks");
  assert.equal(ref.nativeMatchId, "19134500");
  assert.equal(ref.homeTeam.name, "Arsenal");
  assert.equal(ref.awayTeam.name, "Manchester City");
  assert.equal(ref.homeTeam.nativeId, "19");
});

test("parseFixtures treats a zoneless starting_at as UTC", () => {
  const ref = parseFixtures([FIXTURE], "sportmonks")[0]!;
  assert.equal(ref.kickoff.toISOString(), "2024-08-17T14:00:00.000Z");
});

test("parseFixtures prefers the unix timestamp when present", () => {
  const refs = parseFixtures(
    [{ ...FIXTURE, starting_at_timestamp: 1723903200 }],
    "sportmonks",
  );
  assert.equal(refs[0]!.kickoff.toISOString(), "2024-08-17T14:00:00.000Z");
});

test("parseFixtures skips fixtures missing a side or a kickoff", () => {
  const noAway: SportmonksFixture = {
    id: 1,
    starting_at: "2024-08-17 14:00:00",
    participants: [{ id: 19, name: "Arsenal", meta: { location: "home" } }],
  };
  const noKickoff: SportmonksFixture = { ...FIXTURE, id: 2, starting_at: null };

  assert.equal(parseFixtures([noAway], "sportmonks").length, 0);
  assert.equal(parseFixtures([noKickoff], "sportmonks").length, 0);
});

test("parseMatchStats maps known type ids onto canonical stat ids", () => {
  const obs = parseMatchStats(FIXTURE, "sportmonks", "19134500");
  const byStat = new Map(obs.map((o) => [`${o.statTypeId}:${o.subject.nativeId}`, o.value]));

  assert.equal(byStat.get("corners:19"), 7);
  assert.equal(byStat.get("corners:9"), 5);
  assert.equal(byStat.get("yellow_cards:19"), 2);
  assert.equal(byStat.get("shots_total:19"), 14);
  assert.equal(byStat.get("shots_on_target:19"), 6);
});

test("parseMatchStats strips the percent sign off possession", () => {
  const obs = parseMatchStats(FIXTURE, "sportmonks", "19134500");
  const possession = obs.find((o) => o.statTypeId === "possession");
  assert.equal(possession?.value, 58);
});

test("parseMatchStats drops unmapped types, unknown teams and null values", () => {
  const obs = parseMatchStats(FIXTURE, "sportmonks", "19134500");

  // The unmapped 9999 and the null-valued fouls row contribute nothing.
  assert.equal(obs.some((o) => o.value === 1 && o.statTypeId === "9999"), false);
  assert.equal(obs.some((o) => o.statTypeId === "fouls"), false);
  // The statistic for participant 4242, who is not in this fixture, is dropped
  // rather than inventing a team.
  assert.equal(obs.some((o) => o.subject.nativeId === "4242"), false);

  assert.equal(obs.length, 6);
});

test("parseMatchStats tags every observation as a football team subject", () => {
  for (const o of parseMatchStats(FIXTURE, "sportmonks", "19134500")) {
    assert.equal(o.sourceId, "sportmonks");
    assert.equal(o.nativeMatchId, "19134500");
    assert.equal(o.subject.kind, "team");
    assert.equal(o.subject.block.sport, "football");
  }
});

test("Sportmonks overlaps API-Football, so consensus reconciles two sources", () => {
  // The point of this adapter: the same stat now arrives from two independent
  // providers that disagree, which is the case the consensus engine exists for.
  const observations: RawObservation[] = [
    { statTypeId: "corners", teamId: "arsenal", sourceId: "api_football", value: 7 },
    { statTypeId: "corners", teamId: "arsenal", sourceId: "sportmonks", value: 8 },
  ];

  const [consensus] = aggregateMatch("m1", observations);

  assert.ok(consensus);
  assert.equal(consensus.contributors.length, 2);
  // The reconciled value sits between the two disagreeing observations...
  assert.ok(consensus.value > 7 && consensus.value < 8, `got ${consensus.value}`);
  // ...and the disagreement is now visible as non-zero spread, which is exactly
  // what a single-source stat cannot express.
  assert.ok(consensus.variance > 0);
});

test("a lone source still yields consensus, but with no spread", () => {
  const [consensus] = aggregateMatch("m1", [
    { statTypeId: "corners", teamId: "arsenal", sourceId: "api_football", value: 7 },
  ]);

  assert.equal(consensus?.value, 7);
  assert.equal(consensus?.variance, 0);
});
