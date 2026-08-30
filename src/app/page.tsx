import Link from "next/link";
import { DataModeBanner } from "@/components/DataModeBanner";
import { SearchBar } from "@/components/SearchBar";
import { resolveRepository } from "@/lib/stats/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { repo, active, configured, error } = await resolveRepository();

  const [competitions, counts] = await Promise.all([
    repo.listCompetitions(),
    repo.stats(),
  ]);
  const sections = await Promise.all(
    competitions.map(async (comp) => ({
      comp,
      teams: await repo.listTeams(comp.slug),
    })),
  );

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "3rem 1.25rem" }}>
      <h1 style={{ marginBottom: 0 }}>Sportstats</h1>
      <p style={{ color: "var(--muted)", marginTop: ".25rem" }}>
        Consensus-weighted sports statistics aggregated across many providers.
      </p>

      <div style={{ marginTop: "1.75rem" }}>
        <SearchBar />
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <DataModeBanner
          active={active}
          configured={configured}
          error={error}
          matches={counts.matches}
        />
      </div>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.05rem" }}>Browse</h2>
        {sections.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            No competitions available yet.
          </p>
        ) : (
          sections.map(({ comp, teams }) => (
            <div key={comp.slug} style={{ marginBottom: "1.25rem" }}>
              <div style={{ color: "var(--muted)", marginBottom: ".4rem" }}>
                {comp.name}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
                {teams.map((team) => (
                  <Link
                    key={team.id}
                    href={`/team/${team.id}?stat=corners`}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: ".45rem .8rem",
                      background: "var(--card)",
                      textDecoration: "none",
                      color: "var(--fg)",
                    }}
                  >
                    {team.name}
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
