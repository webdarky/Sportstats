import { SOURCE_PRIORS } from "@/lib/consensus/weights";
import { STAT_TYPES } from "@/lib/stat-types/dictionary";

export default function Home() {
  const sources = Object.values(SOURCE_PRIORS).sort(
    (a, b) => b.weight - a.weight,
  );

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "3rem 1.25rem" }}>
      <h1 style={{ marginBottom: 0 }}>Sportstats</h1>
      <p style={{ color: "var(--muted)", marginTop: ".25rem" }}>
        Multi-source sports statistics aggregation — Phase 1 foundation.
      </p>

      <section style={{ marginTop: "2.5rem" }}>
        <h2>Source registry &amp; reputation priors</h2>
        <p style={{ color: "var(--muted)" }}>
          Starting weights for the truth-discovery consensus engine. These are
          dynamically adjusted against post-match official data.
        </p>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {sources.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: ".55rem .9rem",
                borderTop: "1px solid var(--border)",
                background: "var(--card)",
              }}
            >
              <span>
                {s.name}{" "}
                <span style={{ color: "var(--muted)", fontSize: ".85em" }}>
                  ({s.tier.toLowerCase().replace("_", "-")})
                </span>
              </span>
              <strong>{s.weight.toFixed(2)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2>Canonical stat dictionary</h2>
        <p style={{ color: "var(--muted)" }}>
          {STAT_TYPES.length} stat types in the superset taxonomy.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
          {STAT_TYPES.map((s) => (
            <code
              key={s.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: ".15rem .5rem",
                fontSize: ".85em",
                background: "var(--card)",
              }}
            >
              {s.id}
            </code>
          ))}
        </div>
      </section>
    </main>
  );
}
