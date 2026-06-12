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
