import { z } from "zod";

/**
 * Typed, validated environment access. Import `env` instead of reading
 * `process.env` directly so missing/blank required vars fail fast at boot
 * rather than surfacing as confusing runtime errors deep in a request.
 *
 * Provider keys are optional because Phase 1 onboards them incrementally —
 * a feature that needs one should check for it and degrade gracefully.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Core datastore. Optional by design: with no DATABASE_URL the app serves the
  // deterministic demo dataset (see lib/stats/repository.ts), which is what
  // makes a zero-secret deploy possible. Ingestion requires it.
  DATABASE_URL: z.string().url().optional(),

  // Read-side data source. Defaults to "postgres" when DATABASE_URL is set and
  // "demo" otherwise; set explicitly to pin one (e.g. "demo" on a public
  // preview that has a database attached for ingestion only).
  DATA_SOURCE: z.enum(["demo", "postgres"]).optional(),

  // Feature secrets. All optional here; each is enforced by the feature that
  // consumes it (see the note in load()), so an unconfigured feature never
  // takes down the rest of the deployment.
  JWT_SECRET: z.string().min(16).optional(),
  NEXTAUTH_SECRET: z.string().min(16).optional(),
  ENCRYPTION_KEY: z.string().length(64).optional(), // 32-byte hex
  INTERNAL_API_SECRET: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(16).optional(),

  // Optional datastores (Phase 2+).
  REDIS_URL: z.string().url().optional(),
  CLICKHOUSE_URL: z.string().url().optional(),
  ELASTICSEARCH_URL: z.string().url().optional(),

  // Phase 1 provider keys — all optional.
  API_FOOTBALL_KEY: z.string().optional(),
  SPORTMONKS_TOKEN: z.string().optional(),
  THE_ODDS_API_KEY: z.string().optional(),
  FOOTBALL_DATA_ORG_KEY: z.string().optional(),

  // App config.
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  // Secrets are validated per-feature by the code that consumes them, not
  // blanket-required here. JWT_SECRET / NEXTAUTH_SECRET / ENCRYPTION_KEY /
  // INTERNAL_API_SECRET are reserved for the auth and key-vault work and are
  // read by nothing yet — demanding them at boot would take down a read-only
  // deployment for features it does not run. Each consumer should fail closed
  // when its secret is absent, the way /api/cron/ingest 401s without
  // CRON_SECRET. Add the check here alongside the feature, not ahead of it.
  return parsed.data;
}

/** True when a database is configured; ingestion and the Postgres read path
 *  both require it. */
export function hasDatabase(): boolean {
  return Boolean(env.DATABASE_URL);
}

/** Which read-side data source is active. Explicit DATA_SOURCE wins; otherwise
 *  a configured database implies live data and its absence implies demo. */
export function dataSource(): "demo" | "postgres" {
  if (env.DATA_SOURCE) return env.DATA_SOURCE;
  return env.DATABASE_URL ? "postgres" : "demo";
}

export const env = load();
export type Env = z.infer<typeof schema>;
