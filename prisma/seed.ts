/**
 * Seed reference data: the source registry (with reputation priors), the
 * canonical stat-type dictionary, and a starter set of sports in bet365-style
 * popularity order. Safe to re-run — everything upserts.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { SOURCE_PRIORS } from "../src/lib/consensus/weights";
import { STAT_TYPES } from "../src/lib/stat-types/dictionary";

const db = new PrismaClient();

// Blueprint Part 4 popularity ordering (lower priority = more prominent).
const SPORTS = [
  "football",
  "tennis",
  "basketball",
  "cricket",
  "american-football",
  "baseball",
  "ice-hockey",
  "golf",
  "rugby-union",
  "boxing-mma",
];

async function main() {
  for (const [i, slug] of SPORTS.entries()) {
    const name = slug
      .split("-")
      .map((w) => w[0]!.toUpperCase() + w.slice(1))
      .join(" ");
    await db.sport.upsert({
      where: { slug },
      update: { priority: i },
      create: { slug, name, priority: i },
    });
  }

  for (const stat of STAT_TYPES) {
    await db.statType.upsert({
      where: { id: stat.id },
      update: { name: stat.name, unit: stat.unit, isContinuous: stat.isContinuous },
      create: {
        id: stat.id,
        name: stat.name,
        unit: stat.unit,
        isContinuous: stat.isContinuous,
      },
    });
  }

  for (const s of Object.values(SOURCE_PRIORS)) {
    await db.source.upsert({
      where: { id: s.id },
      update: { reputationWeight: s.weight, tier: s.tier, upstreamGroup: s.upstreamGroup ?? null },
      create: {
        id: s.id,
        name: s.name,
        reputationWeight: s.weight,
        tier: s.tier,
        upstreamGroup: s.upstreamGroup ?? null,
      },
    });
  }

  console.log(
    `Seeded ${SPORTS.length} sports, ${STAT_TYPES.length} stat types, ${Object.keys(SOURCE_PRIORS).length} sources.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
