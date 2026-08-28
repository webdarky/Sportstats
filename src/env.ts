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

  // Core datastore — required at runtime, but not during `next build`: see
  // the build-phase guard below.
  DATABASE_URL: z.string().url().optional(),

  // Core secrets — required in production, optional locally so `npm run dev`
  // works before they are generated.
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

  // Build-phase guard: `next build` statically imports route modules to
  // collect page data, which runs this file even though no request is ever
  // served. DATABASE_URL (and the production secrets below) are injected at
  // deploy/runtime, not necessarily present at build time, so skip requiring
  // them during the build phase and enforce when the server actually
  // boots/serves.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (!isBuildPhase && !parsed.data.DATABASE_URL) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  if (parsed.data.NODE_ENV === "production" && !isBuildPhase) {
    const required = [
      "JWT_SECRET",
      "NEXTAUTH_SECRET",
      "ENCRYPTION_KEY",
      "INTERNAL_API_SECRET",
    ] as const;
    const missing = required.filter((k) => !parsed.data[k]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required production secrets: ${missing.join(", ")}`,
      );
    }
  }

  return parsed.data;
}

export const env = load();
export type Env = z.infer<typeof schema>;
