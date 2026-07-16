"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import type { Ampel } from "@/lib/domain/verfall";
import { chipTone } from "@/lib/format";
import { Plakette } from "@/components/Plakette";
import { Filterleiste, type FilterChip } from "@/components/Filterleiste";
import { NeuArtikel } from "./NeuArtikel";
import { ArtikelDrawer } from "./ArtikelDrawer";

export type ArtikelRow = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  mindestbestand: number;
  bestand: number;
  aktiv: boolean;
  naechsteCharge: { chargenNr: string; verfall: string } | null;
  unterMindest: boolean;
  naechsteAmpel: Ampel | null;
  naechsteAblaufText: string | null;
};

function StatusChips({ row }: { row: ArtikelRow }) {
  if (!row.aktiv) {
    return <span className="chip chip-grau">inaktiv</span>;
  }
  if (!row.unterMindest && !row.naechsteAblaufText) {
    return <span className="chip chip-ok">ok</span>;
  }
  return (
    <>
      {row.unterMindest && (
        <span className="chip chip-rot">
          <AlertTriangle size={11} /> unter Mindestbestand
        </span>
      )}
      {row.naechsteAblaufText && row.naechsteAmpel && (
        <span className={`chip chip-${chipTone(row.naechsteAmpel)}`}>Charge {row.naechsteAblaufText}</span>
      )}
    </>
  );
}

export function ArtikelTable({ rows }: { rows: ArtikelRow[] }) {
  const [neuOffen, setNeuOffen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [suche, setSuche] = useState("");
  const [nurUnterMindest, setNurUnterMindest] = useState(false);
  const [nurCharge, setNurCharge] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return rows.filter((r) => {
      if (ohneInaktive && !r.aktiv) return false;
      if (nurUnterMindest && !r.unterMindest) return false;
      if (nurCharge && !r.naechsteAblaufText) return false;
      if (q && !`${r.name} ${r.fach} ${r.naechsteCharge?.chargenNr ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, suche, nurUnterMindest, nurCharge, ohneInaktive]);

  const chips: FilterChip[] = [
    { label: "unter Mindestbestand", aktiv: nurUnterMindest, onToggle: () => setNurUnterMindest((v) => !v) },
    { label: "Charge kritisch", aktiv: nurCharge, onToggle: () => setNurCharge((v) => !v) },
    { label: "inaktive ausblenden", aktiv: ohneInaktive, onToggle: () => setOhneInaktive((v) => !v) },
  ];

  return (
    <>
      <div className="mainhead">
        <h1>Artikel &amp; Bestand</h1>
        <button className="btn btn-rot slim" onClick={() => setNeuOffen(true)}>
          <Plus size={15} /> Neuer Artikel
        </button>
        <p>Handlager · Klick auf eine Zeile öffnet Chargen, Buchung und Stammdaten.</p>
      </div>
      {rows.length === 0 ? (
        <div className="card cardpad">Noch keine Artikel. Lege oben den ersten an.</div>
      ) : (
      <>
      <Filterleiste
        suche={suche}
        onSuche={setSuche}
        platzhalter="Artikel oder Fach suchen…"
        chips={chips}
        treffer={{ gezeigt: gefiltert.length, gesamt: rows.length }}
      />
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Artikel</th>
              <th>Fach</th>
              <th>Bestand</th>
              <th>Min.</th>
              <th>Nächster Verfall</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">Kein Artikel gefunden.</td>
              </tr>
            )}
            {gefiltert.map((row) => (
              <tr key={row.id} className="click" onClick={() => setSelectedId(row.id)} style={row.aktiv ? undefined : { opacity: 0.55 }}>
                <td style={{ fontWeight: 600 }}>{row.name}</td>
                <td>
                  <span className="fach">{row.fach}</span>
                </td>
                <td className="num">
                  {row.bestand}{" "}
                  <span style={{ font: "500 11px var(--body)", color: "var(--stahl)" }}>{row.einheit}</span>
                </td>
                <td className="mono">{row.mindestbestand}</td>
                <td>
                  {row.naechsteCharge && row.naechsteAmpel ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <Plakette verfall={row.naechsteCharge.verfall} ampel={row.naechsteAmpel} />
                      <span className="mono">{row.naechsteCharge.chargenNr}</span>
                    </span>
                  ) : (
                    <span className="chip chip-grau">leer</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <StatusChips row={row} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
      {neuOffen && <NeuArtikel onClose={() => setNeuOffen(false)} />}
      {selectedId && <ArtikelDrawer key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
