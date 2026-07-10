"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Row = { id: string; name: string; einheit: string; fach: string; bestand: number };

export function HelferListe({ artikel }: { artikel: Row[] }) {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? artikel.filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()))
    : artikel;
  return (
    <>
      <input className="input" placeholder="Artikel suchen…" value={q} onChange={(e) => setQ(e.target.value)}
        aria-label="Artikel suchen" style={{ marginBottom: 10 }} />
      <div className="card">
        {filtered.length === 0 && <div className="cardpad">Kein Artikel gefunden.</div>}
        {filtered.map((a) => (
          <Link className="row" key={a.id} href={`/a/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="rowmain">
              <div className="rowname">{a.name}</div>
              <div className="rowmeta"><span className="fach">{a.fach}</span><small>Bestand {a.bestand} {a.einheit}</small></div>
            </div>
            <ChevronRight size={18} />
          </Link>
        ))}
      </div>
    </>
  );
}
