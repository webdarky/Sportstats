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
| Provider adapters | `src/lib/providers/` | Uniform `ProviderAdapter` contract; `api-football.ts` is the worked example. |
| Typed env | `src/env.ts` | Zod-validated; fails fast on missing production secrets. |
| Web shell | `src/app/` | Next.js (App Router) — renders the source registry & stat dictionary. |

## Getting started

```bash
# 1. Install
npm install

# 2. Configure secrets (never commit .env.local)
cp .env.example .env.local
#    then fill in DATABASE_URL and any provider keys you have

# 3. Database
npm run db:generate      # prisma client
npm run db:migrate       # create the schema (needs a running Postgres)
npm run db:seed          # sources, stat types, sports

# 4. Run
npm run dev              # http://localhost:3000
npm test                 # consensus + resolver unit tests
npm run typecheck
```

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
