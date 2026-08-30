import { priorWeight, SOURCE_PRIORS } from "./weights";

/**
 * Truth-discovery consensus engine (CRH / TruthFinder family, blueprint Part 2c).
 *
 * Source reliability and the consensus "truth" are two coupled sets of unknowns,
 * estimated jointly and iteratively: with current weights we compute the truth,
 * then re-weight each source inversely to how far it deviated from that truth,
 * and repeat to convergence. Reputation priors regularize the learned weights so
 * a single noisy match cannot crater a historically reliable source.
 */

export interface Observation<T = number> {
  sourceId: string;
  value: T;
}

export interface ConsensusResult<T = number> {
  value: T;
  /** Spread of contributing observations; high => caller should show a range. */
  variance: number;
  contributors: Array<{ sourceId: string; value: T; weight: number }>;
}

const EPS = 1e-9;

/**
 * Minimum share of its reputation prior a source retains after a single match's
 * disagreement. Keeps per-match reweighting from driving a dissenting source to
 * zero influence, which the iteration cannot recover from. See the derivation
 * in consensusContinuous.
 */
const LEARNED_FLOOR = 0.25;

/**
 * Copy detection (blueprint Part 2c.5): sources sharing an `upstreamGroup`
 * (e.g. WhoScored echoing Opta) should not double-count. We split each group's
 * influence across its members so the group contributes roughly once.
 */
function effectivePriors(sourceIds: string[]): Map<string, number> {
  const groupCounts = new Map<string, number>();
  for (const id of sourceIds) {
    const group = SOURCE_PRIORS[id]?.upstreamGroup;
    // A source with an explicit upstream is grouped with that upstream; a
    // source IS its own group otherwise.
    const key = group ?? id;
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
  }

  const weights = new Map<string, number>();
  for (const id of sourceIds) {
    const group = SOURCE_PRIORS[id]?.upstreamGroup ?? id;
    const share = groupCounts.get(group) ?? 1;
    weights.set(id, priorWeight(id) / share);
  }
  return weights;
}

/** Weighted mean of continuous observations (corners, xG, possession, ...). */
export function consensusContinuous(
  observations: Observation<number>[],
  { iterations = 10 }: { iterations?: number } = {},
): ConsensusResult<number> {
  if (observations.length === 0) {
    throw new Error("consensusContinuous requires at least one observation");
  }

  const priors = effectivePriors(observations.map((o) => o.sourceId));
  let weights = observations.map((o) => priors.get(o.sourceId) ?? 0.5);

  let truth = weightedMean(observations, weights);

  for (let iter = 0; iter < iterations; iter++) {
    const errors = observations.map((o) => (o.value - truth) ** 2);
    const totalError = errors.reduce((a, b) => a + b, 0) + EPS;

    // Learned reliability: lower error => larger -log(normalized error).
    const learned = errors.map((e) => -Math.log((e + EPS) / totalError));
    const maxLearned = Math.max(...learned, EPS);

    // Combine reputation prior with observed accuracy this match, keeping a
    // floor under the learned factor.
    //
    // Without the floor, a source whose error dominates gets
    // errors[i]/totalError -> 1, hence learned[i] -> 0 and weight exactly 0.
    // That is unrecoverable: at zero weight the source stops influencing the
    // truth, which grows its error further, so the iteration runs away until
    // one source wins outright. With few sources it always bites — at two
    // sources, or three split 2-1, consensus collapsed onto a single value and
    // reported variance 0, asserting perfect agreement about a number the
    // sources actually disagreed on. Since disagreement is the thing this
    // engine exists to measure, that failure mode is worse than being wrong.
    //
    // The floor lets one match down-weight a dissenter to at most this
    // fraction of its prior, never silence it. Outlier suppression is
    // preserved; annihilation is not.
    const next = observations.map(
      (o, i) =>
        (priors.get(o.sourceId) ?? 0.5) *
        (LEARNED_FLOOR + (1 - LEARNED_FLOOR) * (learned[i]! / maxLearned)),
    );

    const newTruth = weightedMean(observations, next);
    weights = next;
    if (Math.abs(newTruth - truth) < 1e-6) {
      truth = newTruth;
      break;
    }
    truth = newTruth;
  }

  const variance = weightedVariance(observations, weights, truth);
  return {
    value: truth,
    variance,
    contributors: observations.map((o, i) => ({
      sourceId: o.sourceId,
      value: o.value,
      weight: weights[i]!,
    })),
  };
}

/**
 * Weighted plurality for categorical facts (goal scorer, did-a-goal-count).
 * The winning option's share of total weight doubles as a confidence signal:
 * variance = 1 - winningShare.
 */
export function consensusCategorical<T extends string | number>(
  observations: Observation<T>[],
): ConsensusResult<T> {
  if (observations.length === 0) {
    throw new Error("consensusCategorical requires at least one observation");
  }

  const priors = effectivePriors(observations.map((o) => o.sourceId));
  const tally = new Map<T, number>();
  let total = 0;
  for (const o of observations) {
    const w = priors.get(o.sourceId) ?? 0.5;
    tally.set(o.value, (tally.get(o.value) ?? 0) + w);
    total += w;
  }

  let best: T = observations[0]!.value;
  let bestWeight = -Infinity;
  for (const [value, weight] of tally) {
    if (weight > bestWeight) {
      best = value;
      bestWeight = weight;
    }
  }

  const winningShare = total > 0 ? bestWeight / total : 0;
  return {
    value: best,
    variance: 1 - winningShare,
    contributors: observations.map((o) => ({
      sourceId: o.sourceId,
      value: o.value,
      weight: priors.get(o.sourceId) ?? 0.5,
    })),
  };
}

function weightedMean(obs: Observation<number>[], weights: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < obs.length; i++) {
    num += weights[i]! * obs[i]!.value;
    den += weights[i]!;
  }
  return den > EPS ? num / den : obs.reduce((a, o) => a + o.value, 0) / obs.length;
}

function weightedVariance(
  obs: Observation<number>[],
  weights: number[],
  mean: number,
): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < obs.length; i++) {
    num += weights[i]! * (obs[i]!.value - mean) ** 2;
    den += weights[i]!;
  }
  return den > EPS ? num / den : 0;
}
