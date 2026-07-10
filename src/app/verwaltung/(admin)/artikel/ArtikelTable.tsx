"use client";

import { useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import type { Ampel } from "@/lib/domain/verfall";
import { Plakette } from "@/components/Plakette";
import { NeuArtikel } from "./NeuArtikel";

export type ArtikelRow = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  mindestbestand: number;
  bestand: number;
  naechsteCharge: { chargenNr: string; verfall: string } | null;
  unterMindest: boolean;
  naechsteAmpel: Ampel | null;
  naechsteAblaufText: string | null;
};

function StatusChips({ row }: { row: ArtikelRow }) {
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
        <span className={`chip chip-${row.naechsteAmpel}`}>Charge {row.naechsteAblaufText}</span>
      )}
    </>
  );
}

export function ArtikelTable({ rows }: { rows: ArtikelRow[] }) {
  const [neuOffen, setNeuOffen] = useState(false);

  return (
    <>
      <div className="mainhead">
        <h1>Artikel &amp; Bestand</h1>
        <button className="btn btn-rot slim" onClick={() => setNeuOffen(true)}>
          <Plus size={15} /> Neuer Artikel
        </button>
        <p>Handlager · Klick auf eine Zeile öffnet Chargen, Buchung und Stammdaten.</p>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
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
            {rows.map((row) => (
              <tr key={row.id}>
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
      {neuOffen && <NeuArtikel onClose={() => setNeuOffen(false)} />}
    </>
  );
}
