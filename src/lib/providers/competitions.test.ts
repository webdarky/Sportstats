import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPETITIONS,
  nativeCompetitionId,
  requireNativeCompetitionId,
} from "./competitions";
import { adapters } from "./index";

test("the same competition maps to a different id per provider", () => {
  // The whole point of the registry: these three disagree, and passing any one
  // of them to the others would fetch an unrelated league.
  assert.equal(nativeCompetitionId("england-premier-league", "api_football"), "39");
  assert.equal(nativeCompetitionId("england-premier-league", "sportmonks"), "8");
  assert.equal(
    nativeCompetitionId("england-premier-league", "the_odds_api"),
    "soccer_epl",
  );
});

test("every registered adapter can ingest the default cron competition", () => {
  // vercel.json schedules england-premier-league, so every configured adapter
  // must be able to resolve it or the nightly run half-fails.
  for (const adapter of adapters) {
    assert.doesNotThrow(
      () => requireNativeCompetitionId("england-premier-league", adapter.id),
      `${adapter.id} cannot resolve england-premier-league`,
    );
  }
});

test("an unknown competition throws and lists the known slugs", () => {
  assert.throws(
    () => requireNativeCompetitionId("mars-premier-league", "api_football"),
    /Unknown competition "mars-premier-league".*england-premier-league/s,
  );
});

test("a raw provider id is rejected rather than passed through", () => {
  // Guards the original bug: "39" is meaningful to API-Football but would be a
  // different league entirely in Sportmonks, so it must not be accepted here.
  assert.throws(() => requireNativeCompetitionId("39", "sportmonks"), /Unknown competition/);
});

test("a competition missing one provider's id names that provider", () => {
  // La Liga has no Sportmonks id yet; it must fail loudly rather than guess.
  assert.equal(nativeCompetitionId("spain-la-liga", "sportmonks"), undefined);
  assert.throws(
    () => requireNativeCompetitionId("spain-la-liga", "sportmonks"),
    /No sportmonks league id mapped for competition "spain-la-liga"/,
  );
});

test("registry slugs are unique and every entry maps at least one provider", () => {
  const slugs = COMPETITIONS.map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate competition slug");

  for (const c of COMPETITIONS) {
    assert.ok(
      Object.keys(c.native).length > 0,
      `${c.slug} maps no providers at all`,
    );
  }
});
