"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  teamId: string;
  name: string;
  shortName: string;
  competition?: string;
  detectedStat?: string;
}

/**
 * Primary entry point from blueprint Part 4: a single fuzzy search bar that
 * short-circuits the browse cascade. Typing e.g. "Arsenal corners" jumps
 * straight to that team's corners dashboard.
 */
export function SearchBar() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { results: Hit[] };
        setHits(data.results);
        setOpen(true);
      } catch {
        /* aborted */
      }
    }, 150);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(hit: Hit) {
    const stat = hit.detectedStat ?? "corners";
    router.push(`/team/${hit.teamId}?stat=${stat}`);
  }

  return (
    <div ref={boxRef} style={{ position: "relative", maxWidth: 540 }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) go(hits[0]);
        }}
        placeholder="Search a team or stat — e.g. “Arsenal corners”"
        aria-label="Search teams and stats"
        style={{
          width: "100%",
          padding: ".7rem .9rem",
          fontSize: "1rem",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--card)",
          color: "var(--fg)",
        }}
      />
      {open && hits.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: ".35rem 0 0",
            padding: 0,
            position: "absolute",
            width: "100%",
            zIndex: 10,
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            background: "var(--card)",
          }}
        >
          {hits.map((h) => (
            <li key={h.teamId}>
              <button
                onClick={() => go(h)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: ".55rem .9rem",
                  background: "transparent",
                  color: "var(--fg)",
                  border: "none",
                  borderTop: "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                <strong>{h.name}</strong>{" "}
                <span style={{ color: "var(--muted)", fontSize: ".85em" }}>
                  {h.competition}
                  {h.detectedStat ? ` · ${h.detectedStat.replace(/_/g, " ")}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
