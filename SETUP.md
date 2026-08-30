# Setup — going from demo mode to live data

The app runs with **no configuration at all**: with no `DATABASE_URL` it serves a
deterministic demo dataset and every page works. This document covers turning on
real data.

Check what any deployment is currently doing:

```bash
curl https://<your-deployment>/api/health
```

```jsonc
{
  "status": "ok",
  "dataSource": { "configured": "demo", "active": "demo" },
  "database": { "configured": false, "reachable": false },
  "counts": { "teams": 6, "matches": 30 },
  "providers": [
    { "id": "api_football", "configured": false },
    { "id": "sportmonks", "configured": false },
    { "id": "the_odds_api", "configured": false }
  ],
  "ingestion": { "ready": false }
}
```

`ingestion.ready` becomes `true` once a database **and** at least one provider key
are set. It reports only whether each key is *present*, never its value.

---

## Step 1 — Provision Postgres

Any Postgres works. Free tiers that are enough to start:

| Provider | Link | Notes |
| --- | --- | --- |
| **Neon** | https://neon.tech | Serverless, generous free tier. Best fit for Vercel. |
| **Vercel Postgres** | https://vercel.com/marketplace/neon | Neon under the hood, wired into the project automatically. |
| **Supabase** | https://supabase.com/database | Free tier; use the *connection pooling* string. |

Set `DATABASE_URL` to the connection string. On Vercel: Project → Settings →
Environment Variables.

## Step 2 — Create the schema and seed reference data

**Both commands are required before any ingestion.** Seeding is not optional
cosmetics: `StatValue` rows carry foreign keys to `StatType` and `Source`, so
ingestion fails outright against an unseeded database.

```bash
export DATABASE_URL="postgresql://..."
npm run db:migrate     # create the schema
npm run db:seed        # 10 sports, 27 stat types, 18 source reputation priors
```

## Step 3 — Get a provider key

**Sign up here and paste the keys back — these are the ones worth having.**

| Provider | Sign-up link | Env var | Free tier | What it gives us |
| --- | --- | --- | --- | --- |
| **API-Football** | https://dashboard.api-football.com/register | `API_FOOTBALL_KEY` | 100 req/day | Fixtures + 16 team box-score stats (corners, cards, shots, possession, passes) + xG. |
| **Sportmonks** | https://www.sportmonks.com/register | `SPORTMONKS_TOKEN` | Limited (one league) | Second box-score source, overlapping API-Football on 16 stats. **This is the one that makes consensus real.** |
| **The Odds API** | https://the-odds-api.com/#get-access | `THE_ODDS_API_KEY` | 500 req/month | Odds from ~40 bookmakers → implied win probability. No box-score stats. |
| **Football-Data.org** | https://www.football-data.org/client/register | `FOOTBALL_DATA_ORG_KEY` | 10 req/min | Fixtures/results, thin on stats. **Adapter not written yet.** |

### Get both box-score keys, not just one

The product's premise is reconciling sources that disagree, which takes at least
two sources reporting *the same* stat. API-Football and Sportmonks overlap on 16
statistics; The Odds API overlaps neither (it only reports win probability).

- **API-Football alone** — the site shows real statistics, but every number has
  a single observation. Consensus returns that value verbatim with zero spread,
  and the provenance/variance signal stays dormant.
- **API-Football + Sportmonks** — every displayed stat has two independent
  observations. The truth-discovery engine reconciles them, disagreement shows
  up as real variance, and the reconciliation layer starts earning its keep.

Both have free tiers, so start with both. Sportmonks' free plan covers a single
league; check which one before picking the competition to ingest.

## Step 4 — Set the cron secret

`/api/cron/ingest` refuses every request unless `CRON_SECRET` is set and matches
the bearer token, so it is safe by default. Generate one:

```bash
openssl rand -base64 48
```

Set it as `CRON_SECRET`. Vercel Cron automatically sends
`Authorization: Bearer $CRON_SECRET`, so `vercel.json`'s daily job starts working
once the variable exists.

## Step 5 — Run the first ingestion manually

Do this once before trusting the schedule. `competition` is **our canonical
slug**, not a provider league id — each adapter translates it to its own scheme
(the Premier League is `39` to API-Football, `8` to Sportmonks and `soccer_epl`
to The Odds API). Passing a raw provider id returns a 400 listing the valid
slugs, rather than quietly fetching a different league from every other source.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<your-deployment>/api/cron/ingest?competition=england-premier-league&days=3"
```

Currently registered: `england-premier-league` (all three providers),
`spain-la-liga`, `italy-serie-a`, `germany-bundesliga`, `france-ligue-1`
(API-Football and The Odds API; Sportmonks ids still to be filled in). Add more
in `src/lib/providers/competitions.ts`.

The response reports exactly what happened:

```jsonc
{
  "ok": true,
  "report": {
    "fixtures": 10,
    "observations": 480,
    "consensusValues": 200,
    "bySource": { "api_football": 320, "sportmonks": 160 },
    "errors": []
  }
}
```

`errors` is per-adapter and per-fixture, and non-fatal — a partial run still
persists what it got. A missing league mapping shows up here by name rather than
failing the whole run.

Then reload the site. The banner should turn green and read **Live data**.

---

## Env var reference

| Variable | Required? | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | For live data | Postgres. Absent ⇒ demo mode. |
| `DATA_SOURCE` | No | Pin `demo` or `postgres`. Defaults to `postgres` when `DATABASE_URL` is set. |
| `CRON_SECRET` | For ingestion | Bearer token for `/api/cron/ingest`. |
| `API_FOOTBALL_KEY` | For live data | API-Football box-score stats. |
| `SPORTMONKS_TOKEN` | Strongly recommended | Sportmonks box-score stats — the second source consensus needs. |
| `THE_ODDS_API_KEY` | No | The Odds API implied win probability. |
| `NEXT_PUBLIC_APP_URL` | No | Absolute URL for links. |

`JWT_SECRET`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY` and `INTERNAL_API_SECRET` are
declared for the future auth/key-vault work and are **read by nothing today**.
Leave them unset; they are deliberately not required at boot so an unconfigured
feature cannot take down the deployment.

## Troubleshooting

**Banner is red — "A database is configured but could not be reached."**
`DATABASE_URL` is set but the connection failed; the exact driver error is in
`/api/health` under `dataSource.error`. The app deliberately keeps serving demo
data rather than erroring, so this state is easy to miss without the banner.
Usual causes: missing `?sslmode=require`, or a direct connection string where
the pooled one is needed.

**Banner is amber — "no matches ingested yet."** Database is live but empty. Run
step 5.

**Ingestion returns 503 "no providers configured".** No provider key is set.

**Ingestion returns 500 with a foreign key error.** Step 2's seed did not run.

**Ingestion returns 400 "unknown competition".** You passed a provider league id
(e.g. `39`) instead of a canonical slug. The response lists the valid ones.

**The report's `errors` mentions "No sportmonks league id mapped".** That
competition has no Sportmonks id in the registry yet; the run still ingested
every provider that does have one. Add the id in
`src/lib/providers/competitions.ts`.

**Consensus values look identical to one provider's numbers.** Expected with a
single box-score source — there is nothing to reconcile. Add the second key
(step 3) and re-run; `contributors` on each consensus row shows what was
actually blended.
