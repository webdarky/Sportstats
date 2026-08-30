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
| **API-Football** | https://dashboard.api-football.com/register | `API_FOOTBALL_KEY` | 100 req/day | **The important one.** Fixtures + 16 team box-score stats (corners, cards, shots, possession, passes) + xG. Adapter implemented. |
| **The Odds API** | https://the-odds-api.com/#get-access | `THE_ODDS_API_KEY` | 500 req/month | Odds from ~40 bookmakers → implied win probability. Adapter implemented. **No box-score stats.** |
| **Sportmonks** | https://www.sportmonks.com/register | `SPORTMONKS_TOKEN` | Limited (one league) | Second box-score source. **Adapter not written yet.** |
| **Football-Data.org** | https://www.football-data.org/client/register | `FOOTBALL_DATA_ORG_KEY` | 10 req/min | Fixtures/results, thin on stats. **Adapter not written yet.** |

### Read this before choosing

The product's whole premise is reconciling sources that disagree. Right now only
two adapters exist, and **they do not overlap**: API-Football supplies the
box-score stats the dashboard displays; The Odds API supplies only win
probability. So with both keys set, every displayed stat still has exactly *one*
source, and the consensus engine returns that source's value at halved
confidence. That is correct behaviour, not a bug — but it means the consensus
layer is not yet doing real work on live data.

Getting genuine multi-source consensus on corners/cards/shots needs a **second
box-score provider**, which means writing a second adapter — Sportmonks is the
natural candidate. Say the word and I will build it.

So: **API-Football alone is enough to make the site show real statistics.** The
rest is about making the consensus meaningful.

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

Do this once before trusting the schedule. `competition` is the provider's own
league id — `39` is the Premier League in API-Football.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<your-deployment>/api/cron/ingest?competition=39&days=3"
```

The response reports exactly what happened:

```jsonc
{
  "ok": true,
  "report": {
    "fixtures": 10,
    "observations": 320,
    "consensusValues": 200,
    "bySource": { "api_football": 320 },
    "errors": []
  }
}
```

`errors` is per-fixture and non-fatal — a partial run still persists what it got.

Then reload the site. The banner should turn green and read **Live data**.

---

## Env var reference

| Variable | Required? | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | For live data | Postgres. Absent ⇒ demo mode. |
| `DATA_SOURCE` | No | Pin `demo` or `postgres`. Defaults to `postgres` when `DATABASE_URL` is set. |
| `CRON_SECRET` | For ingestion | Bearer token for `/api/cron/ingest`. |
| `API_FOOTBALL_KEY` | For live data | API-Football. |
| `THE_ODDS_API_KEY` | No | The Odds API. |
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
