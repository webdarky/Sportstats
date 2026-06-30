import type { Competition, Match, RawObservation, Team } from "../stats/types";

/**
 * Deterministic demo dataset: a synthetic Premier League season with realistic,
 * intentionally-disagreeing multi-source observations. It lets the whole app —
 * consensus engine, calculators, API and UI — run and be verified without a
 * live database or provider API keys. A seeded PRNG keeps it stable across
 * builds and test runs.
 *
 * Replace this with the Prisma-backed repository once a database and provider
 * feeds are connected (see src/lib/ingest/pipeline.ts).
 */

// --- deterministic PRNG (mulberry32) -----------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMPETITION: Competition = {
  slug: "england-premier-league",
  name: "Premier League",
  sportSlug: "football",
};

const TEAMS: Team[] = [
  { id: "arsenal", name: "Arsenal", shortName: "ARS", competitionSlug: COMPETITION.slug },
  { id: "man-city", name: "Manchester City", shortName: "MCI", competitionSlug: COMPETITION.slug },
  { id: "liverpool", name: "Liverpool", shortName: "LIV", competitionSlug: COMPETITION.slug },
  { id: "chelsea", name: "Chelsea", shortName: "CHE", competitionSlug: COMPETITION.slug },
  { id: "tottenham", name: "Tottenham Hotspur", shortName: "TOT", competitionSlug: COMPETITION.slug },
  { id: "man-united", name: "Manchester United", shortName: "MUN", competitionSlug: COMPETITION.slug },
];

// Per-team "true" baselines so the dataset has realistic team identity.
const PROFILE: Record<string, { corners: number; cards: number; shots: number; possession: number }> = {
  arsenal: { corners: 6.8, cards: 1.9, shots: 15, possession: 58 },
  "man-city": { corners: 7.4, cards: 1.4, shots: 17, possession: 64 },
  liverpool: { corners: 6.9, cards: 1.7, shots: 16, possession: 60 },
  chelsea: { corners: 5.8, cards: 2.1, shots: 13, possession: 55 },
  tottenham: { corners: 5.5, cards: 2.3, shots: 14, possession: 52 },
  "man-united": { corners: 5.2, cards: 2.4, shots: 12, possession: 50 },
};

// Sources that "observe" each match, with a systematic bias to make consensus
// non-trivial. opta is the near-truth anchor.
const SOURCES: Array<{ id: string; bias: number; noise: number }> = [
  { id: "opta", bias: 0, noise: 0.3 },
  { id: "sportmonks", bias: 0.2, noise: 0.6 },
  { id: "api_football", bias: -0.4, noise: 0.9 },
  { id: "sofascore", bias: 0.6, noise: 1.2 },
];

const SEASON = "2024/2025";
const SEASON_START = new Date("2024-08-17T14:00:00.000Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

function buildMatches(): Match[] {
  const rand = mulberry32(20242025);
  const matches: Match[] = [];
  let matchIndex = 0;

  // Single round-robin: every ordered home/away pair once.
  for (let h = 0; h < TEAMS.length; h++) {
    for (let a = 0; a < TEAMS.length; a++) {
      if (h === a) continue;
      const home = TEAMS[h]!;
      const away = TEAMS[a]!;

      const observations: RawObservation[] = [];
      const trueValues = new Map<string, { corners: number; cards: number; shots: number; possession: number; sot: number }>();

      for (const team of [home, away]) {
        const p = PROFILE[team.id]!;
        const trueCorners = Math.max(0, p.corners + (rand() - 0.5) * 4);
        const trueCards = Math.max(0, p.cards + (rand() - 0.5) * 2);
        const trueShots = Math.max(0, p.shots + (rand() - 0.5) * 6);
        const trueSot = Math.max(0, trueShots * (0.33 + rand() * 0.1));
        const truePossession = p.possession; // possession normalized below
        trueValues.set(team.id, {
          corners: trueCorners,
          cards: trueCards,
          shots: trueShots,
          possession: truePossession,
          sot: trueSot,
        });
      }

      // Normalize possession so home + away ~= 100.
      const hp = trueValues.get(home.id)!.possession;
      const ap = trueValues.get(away.id)!.possession;
      trueValues.get(home.id)!.possession = Math.round((hp / (hp + ap)) * 100);
      trueValues.get(away.id)!.possession = 100 - trueValues.get(home.id)!.possession;

      for (const team of [home, away]) {
        const t = trueValues.get(team.id)!;
        const statTrue: Record<string, number> = {
          corners: t.corners,
          yellow_cards: t.cards,
          shots_total: t.shots,
          shots_on_target: t.sot,
          possession: t.possession,
        };
        for (const [statTypeId, base] of Object.entries(statTrue)) {
          for (const src of SOURCES) {
            const observed = base + src.bias + (rand() - 0.5) * src.noise;
            const value =
              statTypeId === "possession"
                ? Math.round(observed)
                : Math.max(0, Math.round(observed));
            observations.push({ statTypeId, teamId: team.id, sourceId: src.id, value });
          }
        }
      }

      const homeGoals = Math.round(trueValues.get(home.id)!.sot * 0.35);
      const awayGoals = Math.round(trueValues.get(away.id)!.sot * 0.3);

      matches.push({
        id: `m${matchIndex + 1}`,
        competitionSlug: COMPETITION.slug,
        seasonLabel: SEASON,
        round: `Matchweek ${Math.floor(matchIndex / 3) + 1}`,
        kickoff: new Date(SEASON_START + matchIndex * 3 * DAY).toISOString(),
        homeTeamId: home.id,
        awayTeamId: away.id,
        homeScore: homeGoals,
        awayScore: awayGoals,
        observations,
      });
      matchIndex++;
    }
  }

  return matches;
}

export const demoCompetitions: Competition[] = [COMPETITION];
export const demoTeams: Team[] = TEAMS;
export const demoMatches: Match[] = buildMatches();

export function findTeam(id: string): Team | undefined {
  return demoTeams.find((t) => t.id === id);
}
