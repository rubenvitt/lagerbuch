"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, AlertTriangle } from "lucide-react";
import type { BzGeraetZeile } from "@/db/bz";
import { fmtTs, chipTone } from "@/lib/format";
import { Filterleiste, type FilterChip } from "@/components/Filterleiste";

function faelligText(f: BzGeraetZeile["faelligkeit"]): string {
  if (f.nieGeprueft) return "noch nie geprüft";
  if (f.ueberfaellig) return `überfällig (seit ${Math.abs(f.tageBisFaellig ?? 0)} Tagen)`;
  if (f.tageBisFaellig === 0) return "heute fällig";
  return `fällig in ${f.tageBisFaellig} Tagen`;
}

export function BzListe({ geraete }: { geraete: BzGeraetZeile[] }) {
  const [suche, setSuche] = useState("");
  const [nurFaellig, setNurFaellig] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return geraete.filter((g) => {
      if (ohneInaktive && !g.aktiv) return false;
      if (nurFaellig && g.faelligkeit.ampel === "gruen") return false;
      if (q && !`${g.name} ${g.barcode ?? ""} ${g.lagerortName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [geraete, suche, nurFaellig, ohneInaktive]);

  const chips: FilterChip[] = [
    { label: "fällig/überfällig", aktiv: nurFaellig, onToggle: () => setNurFaellig((v) => !v) },
    { label: "inaktive ausblenden", aktiv: ohneInaktive, onToggle: () => setOhneInaktive((v) => !v) },
  ];

  if (geraete.length === 0) {
    return <div className="card cardpad">Noch keine BZ-Geräte. Lege oben das erste an.</div>;
  }

  return (
    <>
      <Filterleiste
        suche={suche}
        onSuche={setSuche}
        platzhalter="Gerät, Barcode oder Lagerort suchen…"
        chips={chips}
        treffer={{ gezeigt: gefiltert.length, gesamt: geraete.length }}
      />
      <div className="card">
        {gefiltert.length === 0 && <div className="empty">Kein Gerät gefunden.</div>}
        {gefiltert.map((g) => (
          <Link className="row" key={g.id} href={`/verwaltung/bz/${g.id}`}>
            <div className="rowmain">
              <div className="rowname">
                {g.name}
                {g.barcode ? <span className="mono" style={{ marginLeft: 8, color: "var(--stahl)" }}>{g.barcode}</span> : null}
              </div>
              <div className="rowmeta">
                {!g.aktiv && <span className="chip chip-grau">inaktiv</span>}
                <small>{g.lagerortName}</small>
                <span className={`chip chip-${chipTone(g.faelligkeit.ampel)}`}>
                  {g.faelligkeit.ampel === "rot" && <AlertTriangle size={11} />} {faelligText(g.faelligkeit)}
                </span>
                <small>· {g.letzteKontrolle ? `zuletzt ${fmtTs(g.letzteKontrolle)}` : "–"}</small>
              </div>
            </div>
            <ChevronRight size={18} style={{ color: "var(--stahl)", flex: "none" }} />
          </Link>
        ))}
      </div>
    </>
  );
}
