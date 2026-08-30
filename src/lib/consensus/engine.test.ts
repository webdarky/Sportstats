import { test } from "node:test";
import assert from "node:assert/strict";
import { consensusContinuous, consensusCategorical } from "./engine";

test("continuous consensus sits near the high-weight cluster", () => {
  // Opta (0.97) and Sportradar (0.96) agree on 6; a weak scraper disagrees.
  const result = consensusContinuous([
    { sourceId: "opta", value: 6 },
    { sourceId: "sportradar", value: 6 },
    { sourceId: "flashscore", value: 9 },
  ]);
  assert.ok(
    Math.abs(result.value - 6) < 0.5,
    `expected ~6, got ${result.value}`,
  );
});

test("unanimous sources yield (near) zero variance", () => {
  const result = consensusContinuous([
    { sourceId: "opta", value: 4 },
    { sourceId: "api_football", value: 4 },
  ]);
  assert.equal(result.value, 4);
  assert.ok(result.variance < 1e-6);
});

test("a lone outlier is pulled toward the trusted majority", () => {
  const withOutlier = consensusContinuous([
    { sourceId: "opta", value: 5 },
    { sourceId: "sportradar", value: 5 },
    { sourceId: "statsbomb", value: 5 },
    { sourceId: "sofascore", value: 12 },
  ]);
  // Naive mean would be 6.75; the engine should land much closer to 5.
  assert.ok(
    withOutlier.value < 6,
    `expected pull toward 5, got ${withOutlier.value}`,
  );
});

test("two disagreeing sources blend instead of collapsing onto one", () => {
  // Regression: per-match reweighting used to drive the dissenting source to
  // exactly zero weight, which the iteration could not recover from. Consensus
  // returned one source's value verbatim and reported variance 0 — claiming
  // perfect agreement about a number the two sources disagreed on. This is the
  // ordinary case for a two-provider deployment, so it has to hold.
  const result = consensusContinuous([
    { sourceId: "api_football", value: 7 },
    { sourceId: "sportmonks", value: 8 },
  ]);

  assert.ok(
    result.value > 7 && result.value < 8,
    `expected a blend of 7 and 8, got ${result.value}`,
  );
  assert.ok(result.variance > 0, "disagreement must be visible as spread");
  for (const c of result.contributors) {
    assert.ok(c.weight > 0, `${c.sourceId} was silenced (weight ${c.weight})`);
  }
});

test("a 2-1 split keeps the dissenter's disagreement visible", () => {
  const result = consensusContinuous([
    { sourceId: "api_football", value: 7 },
    { sourceId: "sofascore", value: 7 },
    { sourceId: "sportmonks", value: 8 },
  ]);

  // The majority wins the value...
  assert.ok(result.value < 7.5, `expected majority pull, got ${result.value}`);
  // ...but the lone dissenter is down-weighted, not erased.
  const dissenter = result.contributors.find((c) => c.sourceId === "sportmonks");
  assert.ok(dissenter && dissenter.weight > 0);
  assert.ok(result.variance > 0);
});

test("the floor still lets a clear outlier be heavily discounted", () => {
  // The fix must not blunt outlier suppression: the disagreeing source should
  // still end up with far less influence than the agreeing majority.
  const result = consensusContinuous([
    { sourceId: "opta", value: 5 },
    { sourceId: "sportradar", value: 5 },
    { sourceId: "sofascore", value: 12 },
  ]);

  const outlier = result.contributors.find((c) => c.sourceId === "sofascore")!;
  const trusted = result.contributors.find((c) => c.sourceId === "opta")!;
  assert.ok(
    outlier.weight < trusted.weight / 2,
    `outlier kept too much influence: ${outlier.weight} vs ${trusted.weight}`,
  );
});

test("copy detection discounts an Opta-derived echo", () => {
  // WhoScored shares Opta's upstream group, so the pair should count ~once
  // rather than out-voting an independent source 2-to-1.
  const echoed = consensusCategorical([
    { sourceId: "opta", value: "playerA" },
    { sourceId: "whoscored", value: "playerA" },
    { sourceId: "sportradar", value: "playerB" },
  ]);
  // opta+whoscored collective weight ~= one opta; sportradar ~0.96 independent.
  // The result should be a genuine contest, not a runaway for playerA.
  assert.ok(echoed.variance > 0.3, `expected a close call, got ${echoed.variance}`);
});

test("categorical plurality picks the weighted winner", () => {
  const result = consensusCategorical([
    { sourceId: "opta", value: "goal" },
    { sourceId: "sofascore", value: "no_goal" },
    { sourceId: "flashscore", value: "no_goal" },
  ]);
  // One high-weight 'goal' (0.97) beats two low-weight 'no_goal' (~1.35) —
  // here the budget pair narrowly wins, demonstrating weight matters.
  assert.equal(result.value, "no_goal");
});
