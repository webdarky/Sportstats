import { consensusContinuous } from "./engine";
import { isContinuousStat } from "../stat-types/dictionary";
import type { ConsensusStat, RawObservation } from "../stats/types";

/**
 * Reduce a match's raw per-source observations into one consensus value per
 * (stat, team) by running the truth-discovery engine over each group. This is
 * the bridge between ingestion (many disagreeing sources) and storage/query
 * (one reconciled `ConsensusValue`).
 */
export function aggregateMatch(
  matchId: string,
  observations: RawObservation[],
): ConsensusStat[] {
  // Group observations by (statTypeId, teamId).
  const groups = new Map<string, RawObservation[]>();
  for (const obs of observations) {
    const key = `${obs.statTypeId}::${obs.teamId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(obs);
    else groups.set(key, [obs]);
  }

  const results: ConsensusStat[] = [];
  for (const [key, group] of groups) {
    const [statTypeId, teamId] = key.split("::") as [string, string];

    // Phase 1 demo data is all continuous; categorical facts (goal scorer,
    // result) would branch to consensusCategorical here.
    if (!isContinuousStat(statTypeId)) continue;

    const consensus = consensusContinuous(
      group.map((o) => ({ sourceId: o.sourceId, value: o.value })),
    );

    results.push({
      matchId,
      statTypeId,
      teamId,
      value: consensus.value,
      variance: consensus.variance,
      contributors: consensus.contributors,
    });
  }

  return results;
}
