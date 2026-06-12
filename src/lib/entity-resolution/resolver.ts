import { jaroWinkler, normalizeName } from "./jaro-winkler";

/**
 * Entity resolution layer (blueprint Part 2a). Reconciles a provider's native
 * entity to our canonical entity in three escalating tiers:
 *
 *   1. Deterministic — a provider-ID crosswalk hit (handled upstream in the DB
 *      via ProviderIdMap; exact, confidence 1.0).
 *   2. Deterministic — exact match on the normalized blocking key.
 *   3. Probabilistic — Jaro-Winkler over names within the same blocking bucket
 *      (sport, country, gender, player birth-year), with anything below the
 *      review threshold routed to a manual queue.
 *
 * Designed to run independently of the SportsDataExchange (SDX) open-ID
 * standard, which is still a pilot — SDX IDs slot in as another deterministic
 * crosswalk source when available.
 */

export interface Candidate {
  canonicalId: string;
  name: string;
  /** Blocking attributes that must match before names are compared. */
  block: BlockingKey;
}

export interface BlockingKey {
  sport: string;
  country?: string;
  gender?: string;
  birthYear?: number;
}

export interface ResolutionInput {
  name: string;
  block: BlockingKey;
}

export type Resolution =
  | { status: "matched"; canonicalId: string; confidence: number }
  | { status: "review"; bestCandidateId: string; confidence: number }
  | { status: "unmatched" };

/** Auto-accept at/above this similarity; route to review between the two. */
export const AUTO_MATCH_THRESHOLD = 0.92;
export const REVIEW_THRESHOLD = 0.8;

function sameBlock(a: BlockingKey, b: BlockingKey): boolean {
  if (a.sport !== b.sport) return false;
  if (a.country && b.country && a.country !== b.country) return false;
  if (a.gender && b.gender && a.gender !== b.gender) return false;
  // Allow ±1 year slack on birth-year to absorb provider data-entry drift.
  if (a.birthYear && b.birthYear && Math.abs(a.birthYear - b.birthYear) > 1) {
    return false;
  }
  return true;
}

export function resolveEntity(
  input: ResolutionInput,
  candidates: Candidate[],
): Resolution {
  const target = normalizeName(input.name);

  let best: { id: string; score: number } | null = null;
  for (const candidate of candidates) {
    if (!sameBlock(input.block, candidate.block)) continue;

    const score = jaroWinkler(target, normalizeName(candidate.name));
    if (!best || score > best.score) {
      best = { id: candidate.canonicalId, score };
    }
  }

  if (!best) return { status: "unmatched" };
  if (best.score >= AUTO_MATCH_THRESHOLD) {
    return { status: "matched", canonicalId: best.id, confidence: best.score };
  }
  if (best.score >= REVIEW_THRESHOLD) {
    return { status: "review", bestCandidateId: best.id, confidence: best.score };
  }
  return { status: "unmatched" };
}
