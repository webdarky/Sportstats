/**
 * Jaro-Winkler string similarity, used for probabilistic entity matching when
 * deterministic keys (provider ID crosswalk, exact normalized name) miss.
 * Blueprint Part 2a. Returns a score in [0, 1]; 1 is an exact match.
 */
export function jaroWinkler(a: string, b: string): number {
  const jaro = jaroSimilarity(a, b);
  if (jaro < 0.7) return jaro; // Winkler boost only applies to closer matches.

  // Common prefix up to 4 chars boosts the score (scaling factor p = 0.1).
  let prefix = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  // Count transpositions.
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  return (
    (matches / a.length +
      matches / b.length +
      (matches - transpositions) / matches) /
    3
  );
}

/** Normalize names before comparison: lowercase, strip accents & punctuation. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
