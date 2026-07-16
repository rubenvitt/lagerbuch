"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, AlertTriangle } from "lucide-react";
import type { FahrzeugUebersichtZeile } from "@/db/queries";
import { fmtTs } from "@/lib/format";
import { Filterleiste, type FilterChip } from "@/components/Filterleiste";

export function FahrzeugeListe({ fahrzeuge }: { fahrzeuge: FahrzeugUebersichtZeile[] }) {
  const [suche, setSuche] = useState("");
  const [nurUnterSoll, setNurUnterSoll] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return fahrzeuge.filter((f) => {
      if (ohneInaktive && !f.aktiv) return false;
      if (nurUnterSoll && f.artikelUnterSoll === 0) return false;
      if (q && !`${f.name} ${f.kennung ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [fahrzeuge, suche, nurUnterSoll, ohneInaktive]);

  const chips: FilterChip[] = [
    { label: "unter Soll", aktiv: nurUnterSoll, onToggle: () => setNurUnterSoll((v) => !v) },
    { label: "inaktive ausblenden", aktiv: ohneInaktive, onToggle: () => setOhneInaktive((v) => !v) },
  ];

  if (fahrzeuge.length === 0) {
    return <div className="card cardpad">Noch keine Fahrzeuge. Lege oben das erste an.</div>;
  }

  return (
    <>
      <Filterleiste
        suche={suche}
        onSuche={setSuche}
        platzhalter="Fahrzeug oder Kennung suchen…"
        chips={chips}
        treffer={{ gezeigt: gefiltert.length, gesamt: fahrzeuge.length }}
      />
      <div className="card">
        {gefiltert.length === 0 && <div className="empty">Kein Fahrzeug gefunden.</div>}
        {gefiltert.map((f) => (
          <Link className="row" key={f.id} href={`/verwaltung/fahrzeuge/${f.id}`}>
            <div className="rowmain">
              <div className="rowname">
                {f.name}
                {f.kennung ? <span className="mono" style={{ marginLeft: 8, color: "var(--stahl)" }}>{f.kennung}</span> : null}
              </div>
              <div className="rowmeta">
                {!f.aktiv && <span className="chip chip-grau">inaktiv</span>}
                {f.templateName && <span className="chip chip-grau">{f.templateName}</span>}
                <small>
                  {f.positionen} Position{f.positionen === 1 ? "" : "en"}
                  {f.faecher > 0 ? ` · ${f.faecher} ${f.faecher === 1 ? "Fach" : "Fächer"}` : ""}
                </small>
                {f.artikelUnterSoll > 0 && (
                  <span className="chip chip-rot"><AlertTriangle size={11} /> {f.artikelUnterSoll} unter Soll</span>
                )}
                {f.positionen > 0 && f.artikelUnterSoll === 0 && <span className="chip chip-ok">auf Soll</span>}
                <small>· {f.letzterCheck ? `zuletzt geprüft ${fmtTs(f.letzterCheck)}` : "noch nie geprüft"}</small>
              </div>
            </div>
            <ChevronRight size={18} style={{ color: "var(--stahl)", flex: "none" }} />
          </Link>
        ))}
      </div>
    </>
  );
}
