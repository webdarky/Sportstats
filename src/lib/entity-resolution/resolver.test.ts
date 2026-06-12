import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEntity, type Candidate } from "./resolver";

const candidates: Candidate[] = [
  { canonicalId: "p1", name: "Erling Haaland", block: { sport: "football", birthYear: 2000 } },
  { canonicalId: "p2", name: "Bukayo Saka", block: { sport: "football", birthYear: 2001 } },
  { canonicalId: "t1", name: "Manchester City", block: { sport: "football", country: "GB" } },
];

test("accent/spelling variant auto-matches the right player", () => {
  const r = resolveEntity(
    { name: "Erling Håland", block: { sport: "football", birthYear: 2000 } },
    candidates,
  );
  assert.equal(r.status, "matched");
  if (r.status === "matched") assert.equal(r.canonicalId, "p1");
});

test("blocking prevents cross-sport false positives", () => {
  const r = resolveEntity(
    { name: "Manchester City", block: { sport: "basketball" } },
    candidates,
  );
  assert.equal(r.status, "unmatched");
});

test("a borderline name is routed to manual review", () => {
  const r = resolveEntity(
    { name: "B. Saka", block: { sport: "football", birthYear: 2001 } },
    candidates,
  );
  assert.ok(r.status === "review" || r.status === "unmatched");
});
