"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, AlertTriangle } from "lucide-react";
import type { O2FlascheZeile } from "@/db/sauerstoff";
import { chipTone } from "@/lib/format";
import { Filterleiste, type FilterChip } from "@/components/Filterleiste";

export function SauerstoffListe({ flaschen }: { flaschen: O2FlascheZeile[] }) {
  const [suche, setSuche] = useState("");
  const [nurNiedrig, setNurNiedrig] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return flaschen.filter((f) => {
      if (ohneInaktive && !f.aktiv) return false;
      if (nurNiedrig && !f.status?.niedrig) return false;
      if (q && !`${f.name} ${f.lagerortName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [flaschen, suche, nurNiedrig, ohneInaktive]);

  const chips: FilterChip[] = [
    { label: "niedriger Druck", aktiv: nurNiedrig, onToggle: () => setNurNiedrig((v) => !v) },
    { label: "inaktive ausblenden", aktiv: ohneInaktive, onToggle: () => setOhneInaktive((v) => !v) },
  ];

  if (flaschen.length === 0) {
    return <div className="card cardpad">Noch keine Flaschen. Lege oben die erste an.</div>;
  }

  return (
    <>
      <Filterleiste
        suche={suche}
        onSuche={setSuche}
        platzhalter="Flasche oder Lagerort suchen…"
        chips={chips}
        treffer={{ gezeigt: gefiltert.length, gesamt: flaschen.length }}
      />
      <div className="card">
        {gefiltert.length === 0 && <div className="empty">Keine Flasche gefunden.</div>}
        {gefiltert.map((f) => (
          <Link className="row" key={f.id} href={`/verwaltung/sauerstoff/${f.id}`}>
            <div className="rowmain">
              <div className="rowname">
                {f.name}
                <span className="mono" style={{ marginLeft: 8, color: "var(--stahl)" }}>{f.lagerortName}</span>
              </div>
              <div className="rowmeta">
                {!f.aktiv && <span className="chip chip-grau">inaktiv</span>}
                {f.status ? (
                  <>
                    <span className={`chip chip-${chipTone(f.status.ampel)}`}>{f.status.prozent}%</span>
                    {f.status.niedrig && <span className="chip chip-rot"><AlertTriangle size={11} /> niedriger Druck</span>}
                  </>
                ) : (
                  <span className="chip chip-grau">keine Messung</span>
                )}
                <small>{f.groesseLiter ? `${f.groesseLiter} l · ` : ""}Nenndruck {f.nennfuelldruckBar} bar</small>
              </div>
            </div>
            <div className="bignum" style={{ fontSize: 18, flex: "none" }}>
              {f.letzterDruck !== null ? f.letzterDruck : "–"}<small>bar</small>
            </div>
            <ChevronRight size={18} style={{ color: "var(--stahl)", flex: "none" }} />
          </Link>
        ))}
      </div>
    </>
  );
}
