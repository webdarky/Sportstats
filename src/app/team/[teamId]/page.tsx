import Link from "next/link";
import { notFound } from "next/navigation";
import { TrendChart, DistributionChart } from "@/components/Charts";
import { DataModeBanner } from "@/components/DataModeBanner";
import { STAT_TYPE_BY_ID } from "@/lib/stat-types/dictionary";
import { getTeamStat, SUPPORTED_STATS } from "@/lib/stats/query";
import { resolveRepository } from "@/lib/stats/repository";

export const dynamic = "force-dynamic";

const TIMEFRAMES = ["1m", "6m", "1y", "3y", "all"] as const;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "1rem 1.1rem",
        background: "var(--card)",
        minWidth: 150,
        flex: 1,
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: ".8rem" }}>{label}</div>
      <div style={{ fontSize: "1.7rem", fontWeight: 600, marginTop: ".2rem" }}>
        {value}
      </div>
    </div>
  );
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        padding: ".35rem .7rem",
        borderRadius: 999,
        fontSize: ".85rem",
        textDecoration: "none",
        border: "1px solid var(--border)",
        background: active ? "var(--accent)" : "var(--card)",
        color: active ? "#03130a" : "var(--fg)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </Link>
  );
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ stat?: string; timeframe?: string }>;
}) {
  const { teamId } = await params;
  const sp = await searchParams;
  const stat = sp.stat ?? "corners";
  const timeframe = sp.timeframe ?? "all";

  const { repo, active, configured, error } = await resolveRepository();

  const team = await repo.getTeam(teamId);
  if (!team) notFound();

  const result = await getTeamStat({ teamId, statTypeId: stat, timeframe });
  if (!result) notFound();
  const { summary, statName } = result;

  // Resolve opponent names once up front — the recent-games list renders
  // synchronously and cannot await per row.
  const opponents = new Map(
    (await repo.listTeams()).map((t) => [t.id, t] as const),
  );

  const href = (next: { stat?: string; timeframe?: string }) =>
    `/team/${teamId}?stat=${next.stat ?? stat}&timeframe=${next.timeframe ?? timeframe}`;

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "2.5rem 1.25rem" }}>
      <Link href="/" style={{ fontSize: ".85rem" }}>
        ← Search
      </Link>
      <h1 style={{ margin: ".5rem 0 0" }}>{team.name}</h1>
      <p style={{ color: "var(--muted)", marginTop: ".2rem" }}>
        {statName} · consensus across multiple sources
      </p>

      <div style={{ marginTop: "1rem" }}>
        <DataModeBanner active={active} configured={configured} error={error} />
      </div>

      {/* Stat selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginTop: "1.25rem" }}>
        {SUPPORTED_STATS.map((s) => (
          <Pill key={s} href={href({ stat: s })} active={s === stat}>
            {STAT_TYPE_BY_ID.get(s)?.name ?? s}
          </Pill>
        ))}
      </div>
      {/* Timeframe selector */}
      <div style={{ display: "flex", gap: ".4rem", marginTop: ".6rem" }}>
        {TIMEFRAMES.map((t) => (
          <Pill key={t} href={href({ timeframe: t })} active={t === timeframe}>
            {t}
          </Pill>
        ))}
      </div>

      {summary.games === 0 ? (
        <p style={{ marginTop: "2rem", color: "var(--muted)" }}>
          No matches in this timeframe.
        </p>
      ) : (
        <>
          {/* The three headline calculators from blueprint Part 4. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", marginTop: "1.5rem" }}>
            <Stat label={`Total ${statName} (all games)`} value={summary.totalAllTime} />
            <Stat label={`Avg ${statName} / game`} value={summary.averagePerGame} />
            <Stat label={`Combined ${statName} / game`} value={summary.combinedAveragePerGame} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", marginTop: ".75rem" }}>
            <Stat label="Games" value={summary.games} />
            <Stat label="Min" value={summary.min} />
            <Stat label="Max" value={summary.max} />
          </div>

          <section style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: "1rem" }}>Per-game trend</h2>
            <TrendChart trend={summary.trend} />
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem" }}>Distribution</h2>
            <DistributionChart distribution={summary.distribution} />
          </section>

          <section style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontSize: "1rem" }}>Recent games</h2>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {[...summary.trend].reverse().slice(0, 10).map((g, i) => {
                const opp = opponents.get(g.opponentId);
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: ".5rem .9rem",
                      borderTop: i === 0 ? "none" : "1px solid var(--border)",
                      background: "var(--card)",
                    }}
                  >
                    <span style={{ color: "var(--muted)" }}>
                      {g.kickoff.slice(0, 10)} · vs {opp?.shortName ?? g.opponentId}
                    </span>
                    <strong>{g.value}</strong>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
