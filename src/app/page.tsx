import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";
import { listCompetitions, listTeams } from "@/lib/stats/query";

export default function Home() {
  const competitions = listCompetitions();

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "3rem 1.25rem" }}>
      <h1 style={{ marginBottom: 0 }}>Sportstats</h1>
      <p style={{ color: "var(--muted)", marginTop: ".25rem" }}>
        Consensus-weighted sports statistics aggregated across many providers.
      </p>

      <div style={{ marginTop: "1.75rem" }}>
        <SearchBar />
      </div>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1.05rem" }}>Browse</h2>
        {competitions.map((comp) => (
          <div key={comp.slug} style={{ marginBottom: "1.25rem" }}>
            <div style={{ color: "var(--muted)", marginBottom: ".4rem" }}>
              {comp.name}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
              {listTeams(comp.slug).map((team) => (
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
        ))}
      </section>

      <p style={{ marginTop: "2rem", color: "var(--muted)", fontSize: ".85rem" }}>
        Data shown is a deterministic demo dataset. Connect a database and
        provider keys to ingest live feeds — see the README.
      </p>
    </main>
  );
}
