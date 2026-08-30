# Sportstats

A multi-source **sports statistics aggregation platform**. Many providers
disagree on the same numbers; the platform's core IP is reconciling them into a
single, auditable, consensus-weighted "truth."

This repo currently contains the **Phase 1 foundation** from the architecture
blueprint — the canonical data model and the aggregation engine. Heavy
infrastructure (Kafka, ClickHouse, TimescaleDB, Elasticsearch, scraper fleet)
and enterprise data feeds are intentionally **deferred to Phase 2/3**.

## What's here

| Area | Location | Notes |
| --- | --- | --- |
| Canonical schema | `prisma/schema.prisma` | Opta/Sportmonks-modeled. Raw observations (`StatValue`) kept separate from computed truth (`ConsensusValue`) for full lineage. |
| Consensus engine | `src/lib/consensus/` | Truth-discovery (CRH-style) weighting + copy detection. Reputation priors in `weights.ts`. |
| Entity resolution | `src/lib/entity-resolution/` | Deterministic crosswalk → exact key → Jaro-Winkler fuzzy with a review queue. |
| Stat dictionary | `src/lib/stat-types/dictionary.ts` | Superset of provider taxonomies. |
| Provider adapters | `src/lib/providers/` | Uniform `ProviderAdapter` contract. Implemented: API-Football (box-score stats), The Odds API (implied win probability). |
| Ingestion pipeline | `src/lib/ingest/` | Adapters → entity resolution → raw `StatValue` → consensus → `ConsensusValue`. Repository-abstracted, so it unit-tests without a database. |
| Read layer | `src/lib/stats/` | `StatsRepository` contract with demo and Prisma implementations; calculators for the dashboard totals/averages/trend/histogram. |
| Typed env | `src/env.ts` | Zod-validated. Secrets are enforced by the features that consume them, not blanket-required at boot. |
| Web shell | `src/app/` | Next.js (App Router) — fuzzy search, per-team stat dashboards, `/api/health`. |

## Getting started

The app runs with **no configuration at all** — no database, no API keys:

```bash
npm install
npm run dev              # http://localhost:3000
```

With nothing configured it serves a deterministic demo dataset (a synthetic
Premier League season with intentionally-disagreeing sources), so the whole
product — search, dashboards, consensus, charts — is explorable immediately. A
banner on every page states which data source you are looking at, so demo
numbers are never mistaken for live ones.

To connect real data, see **[SETUP.md](./SETUP.md)** — Postgres, provider
sign-up links, and the first ingestion run.

```bash
npm test                 # 22 unit tests: consensus, resolver, calculators, repositories
npm run typecheck
npm run build
```

## Data modes

The read layer sits behind a `StatsRepository` contract with two implementations,
selected by configuration:

| `DATABASE_URL` | Mode | Behaviour |
| --- | --- | --- |
| unset | `demo` | Deterministic synthetic dataset. |
| set, reachable | `postgres` | Live ingested data. |
| set, unreachable | `demo` (degraded) | Falls back to demo rather than erroring, and says so loudly — red banner, `/api/health` 503. |

Both implementations return the same domain shapes, and consensus is recomputed
on read from raw per-source observations in either mode — so there is exactly one
consensus code path in the product, and it is the tested one.

`GET /api/health` reports the active mode, database reachability, ingested row
counts and which provider keys are present (never their values).

## Secrets

Secrets are **never** committed. They live in:

- `.env.local` for local dev (git-ignored — see `.env.example` for the names),
- **GitHub Actions secrets** for CI (Settings → Secrets and variables → Actions),
- your host's env-var settings (e.g. Vercel) for production.

Application code only ever references secret **names** (`process.env.X` via
`src/env.ts`), never values. Regenerate any secret that has been shared in
chat/email before using it in production:

```bash
openssl rand -base64 48   # JWT_SECRET, NEXTAUTH_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY
```

## Roadmap

- **Phase 1 (now):** Football MVP — API-Football, Sportmonks, The Odds API +
  free sources; canonical schema; static→dynamic consensus weights.
- **Phase 2:** Multi-sport breadth; live in-match streaming; dynamic weight
  learning + copy detection at scale.
- **Phase 3:** Enterprise feeds (Opta / Sportradar / Genius) with
  per-contract redistribution review.

> Legal note: scraped/enterprise sources carry ToS, database-right and
> redistribution constraints (blueprint Part 5). Treat scrapers as
> corroboration only and get counsel review before surfacing enterprise feed
> *values* downstream.
