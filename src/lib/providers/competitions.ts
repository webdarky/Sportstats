/**
 * Canonical competition registry.
 *
 * Every provider numbers leagues differently — the Premier League is `39` to
 * API-Football, `8` to Sportmonks and `soccer_epl` to The Odds API. The
 * ingestion pipeline drives all adapters from one competition per run, so that
 * identifier has to be canonical and translated per source. Passing a raw
 * provider id straight through would silently fetch a *different league* from
 * every other provider and then reconcile the results as if they described the
 * same matches, which corrupts consensus rather than failing loudly.
 *
 * Adding a competition is a one-line edit here. An adapter with no id for a
 * competition throws, and the pipeline records that in its report — a missing
 * mapping is visible, never a silent wrong-league fetch.
 */

export interface CompetitionRef {
  /** Our canonical slug, matching the Competition.slug in the database. */
  slug: string;
  name: string;
  /** sourceId -> that provider's native league / sport identifier. */
  native: Record<string, string>;
}

export const COMPETITIONS: CompetitionRef[] = [
  {
    slug: "england-premier-league",
    name: "Premier League",
    native: {
      api_football: "39",
      sportmonks: "8",
      the_odds_api: "soccer_epl",
    },
  },
  // The remaining big-five leagues carry the ids we have confirmed. Sportmonks
  // ids are deliberately absent rather than guessed: a wrong league id is worse
  // than a missing one, because it ingests real data under the wrong fixtures.
  {
    slug: "spain-la-liga",
    name: "La Liga",
    native: { api_football: "140", the_odds_api: "soccer_spain_la_liga" },
  },
  {
    slug: "italy-serie-a",
    name: "Serie A",
    native: { api_football: "135", the_odds_api: "soccer_italy_serie_a" },
  },
  {
    slug: "germany-bundesliga",
    name: "Bundesliga",
    native: { api_football: "78", the_odds_api: "soccer_germany_bundesliga" },
  },
  {
    slug: "france-ligue-1",
    name: "Ligue 1",
    native: { api_football: "61", the_odds_api: "soccer_france_ligue_one" },
  },
];

export const COMPETITION_BY_SLUG = new Map(
  COMPETITIONS.map((c) => [c.slug, c] as const),
);

/** Provider-native id for a canonical competition, or undefined if unmapped. */
export function nativeCompetitionId(
  slug: string,
  sourceId: string,
): string | undefined {
  return COMPETITION_BY_SLUG.get(slug)?.native[sourceId];
}

/**
 * Resolve a competition for one adapter, throwing a message that names both
 * sides of the mismatch. Adapters call this instead of trusting the raw string.
 */
export function requireNativeCompetitionId(
  slug: string,
  sourceId: string,
): string {
  if (!COMPETITION_BY_SLUG.has(slug)) {
    const known = COMPETITIONS.map((c) => c.slug).join(", ");
    throw new Error(
      `Unknown competition "${slug}". Known competitions: ${known}. ` +
        `Add it to src/lib/providers/competitions.ts.`,
    );
  }
  const native = nativeCompetitionId(slug, sourceId);
  if (!native) {
    throw new Error(
      `No ${sourceId} league id mapped for competition "${slug}". ` +
        `Add it to src/lib/providers/competitions.ts.`,
    );
  }
  return native;
}
