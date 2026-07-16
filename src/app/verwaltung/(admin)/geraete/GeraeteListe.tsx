"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, AlertTriangle, HeartPulse, Package } from "lucide-react";
import type { GeraetZeile, GeraetTyp } from "@/db/geraete";
import { geraetFaelligChip } from "@/lib/format";
import { Filterleiste, toggleInSet, type FilterChip } from "@/components/Filterleiste";

export function GeraeteListe({ geraete }: { geraete: GeraetZeile[] }) {
  const [suche, setSuche] = useState("");
  const [typFilter, setTypFilter] = useState<Set<GeraetTyp>>(new Set());
  const [nurFaellig, setNurFaellig] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return geraete.filter((g) => {
      if (ohneInaktive && !g.aktiv) return false;
      if (typFilter.size > 0 && !typFilter.has(g.typ)) return false;
      if (nurFaellig && (g.faelligkeit.keinDatum || g.faelligkeit.ampel === "gruen")) return false;
      if (q && !`${g.name} ${g.barcode ?? ""} ${g.lagerortName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [geraete, suche, typFilter, nurFaellig, ohneInaktive]);

  const toggleTyp = (t: GeraetTyp) => setTypFilter((prev) => toggleInSet(prev, t));

  const chips: FilterChip[] = [
    { label: "Medizin", aktiv: typFilter.has("medizin"), onToggle: () => toggleTyp("medizin"), icon: <HeartPulse size={12} /> },
    { label: "Objekt", aktiv: typFilter.has("objekt"), onToggle: () => toggleTyp("objekt"), icon: <Package size={12} /> },
    { label: "nur fällige", aktiv: nurFaellig, onToggle: () => setNurFaellig((v) => !v) },
    { label: "inaktive ausblenden", aktiv: ohneInaktive, onToggle: () => setOhneInaktive((v) => !v) },
  ];

  if (geraete.length === 0) {
    return <div className="card cardpad">Noch keine Geräte. Lege oben das erste an.</div>;
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
        {gefiltert.map((g) => {
          const fi = geraetFaelligChip(g.typ, g.faelligkeit);
          const TypIcon = g.typ === "medizin" ? HeartPulse : Package;
          return (
            <Link className="row" key={g.id} href={`/verwaltung/geraete/${g.id}`}>
              <div className="rowmain">
                <div className="rowname">
                  {g.name}
                  {g.barcode ? <span className="mono" style={{ marginLeft: 8, color: "var(--stahl)" }}>{g.barcode}</span> : null}
                </div>
                <div className="rowmeta">
                  <span className="chip chip-grau" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <TypIcon size={11} /> {g.typ === "medizin" ? "Medizin" : "Objekt"}
                  </span>
                  {!g.aktiv && <span className="chip chip-grau">inaktiv</span>}
                  <small>{g.lagerortName}</small>
                  {fi && (
                    <span className={`chip chip-${fi.tone}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {fi.tone === "rot" && <AlertTriangle size={11} />} {fi.text}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight size={18} style={{ color: "var(--stahl)", flex: "none" }} />
            </Link>
          );
        })}
      </div>
    </>
  );
}
