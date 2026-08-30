import type { DataMode } from "@/lib/stats/repository";

/**
 * States the banner distinguishes, worst-to-best:
 *  - degraded: Postgres was configured but is unreachable, so these are demo
 *    numbers wearing a live deployment's clothes. Loudest case.
 *  - demo: no database configured; expected, and stated plainly.
 *  - empty: Postgres is live but ingestion has not run yet.
 *  - live: real ingested data.
 */
export function DataModeBanner({
  active,
  configured,
  error,
  matches,
}: {
  active: DataMode;
  configured: DataMode;
  error?: string;
  matches?: number;
}) {
  const degraded = configured === "postgres" && active === "demo";
  const empty = active === "postgres" && matches === 0;

  const tone = degraded
    ? { bg: "#3a1d1d", border: "#7f3838", fg: "#ffd9d9" }
    : empty
      ? { bg: "#3a331d", border: "#7f6f38", fg: "#ffefd0" }
      : active === "postgres"
        ? { bg: "#16301f", border: "#2f6b45", fg: "#c8f2d8" }
        : { bg: "var(--card)", border: "var(--border)", fg: "var(--muted)" };

  const message = degraded ? (
    <>
      <strong>Showing demo data.</strong> A database is configured but could not
      be reached, so these numbers are synthetic — not live statistics.
      {error ? <span style={{ opacity: 0.8 }}> ({error})</span> : null}
    </>
  ) : empty ? (
    <>
      <strong>Connected to Postgres, but no matches ingested yet.</strong> Add a
      provider key and run an ingestion to populate real statistics — see
      SETUP.md.
    </>
  ) : active === "postgres" ? (
    <>
      <strong>Live data.</strong> Consensus computed across ingested provider
      feeds{typeof matches === "number" ? ` over ${matches} matches` : ""}.
    </>
  ) : (
    <>
      <strong>Demo dataset.</strong> A deterministic synthetic season, so the
      app is fully explorable without a database or provider keys. Connect
      Postgres and a provider to ingest live feeds — see SETUP.md.
    </>
  );

  return (
    <div
      role="status"
      style={{
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.fg,
        borderRadius: 8,
        padding: ".6rem .85rem",
        fontSize: ".85rem",
        lineHeight: 1.45,
      }}
    >
      {message}
    </div>
  );
}
