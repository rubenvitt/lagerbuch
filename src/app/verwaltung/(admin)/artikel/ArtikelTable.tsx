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

type SortKey = "name-asc" | "name-desc" | "fach" | "bestand-asc" | "bestand-desc" | "verfall";

const SORT_OPTIONEN: { wert: SortKey; label: string }[] = [
  { wert: "name-asc", label: "Name A–Z" },
  { wert: "name-desc", label: "Name Z–A" },
  { wert: "fach", label: "Fach" },
  { wert: "bestand-asc", label: "Bestand aufsteigend" },
  { wert: "bestand-desc", label: "Bestand absteigend" },
  { wert: "verfall", label: "Nächster Verfall" },
];

/** Vergleichsfunktionen je Sortierung; Zweitkriterium ist stets der Name (stabile, erwartbare Reihenfolge). */
function vergleiche(sort: SortKey): (a: ArtikelRow, b: ArtikelRow) => number {
  const nachName = (a: ArtikelRow, b: ArtikelRow) => a.name.localeCompare(b.name, "de");
  switch (sort) {
    case "name-desc":
      return (a, b) => b.name.localeCompare(a.name, "de");
    case "fach":
      return (a, b) => a.fach.localeCompare(b.fach, "de") || nachName(a, b);
    case "bestand-asc":
      return (a, b) => a.bestand - b.bestand || nachName(a, b);
    case "bestand-desc":
      return (a, b) => b.bestand - a.bestand || nachName(a, b);
    case "verfall":
      // Artikel ohne Charge ans Ende, sonst frühester Verfall zuerst.
      return (a, b) => {
        const av = a.naechsteCharge?.verfall ?? "";
        const bv = b.naechsteCharge?.verfall ?? "";
        if (!av && !bv) return nachName(a, b);
        if (!av) return 1;
        if (!bv) return -1;
        return av.localeCompare(bv) || nachName(a, b);
      };
    default:
      return nachName;
  }
}

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
  const [sort, setSort] = useState<SortKey>("name-asc");

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (ohneInaktive && !r.aktiv) return false;
        if (nurUnterMindest && !r.unterMindest) return false;
        if (nurCharge && !r.naechsteAblaufText) return false;
        if (q && !`${r.name} ${r.fach} ${r.naechsteCharge?.chargenNr ?? ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(vergleiche(sort));
  }, [rows, suche, nurUnterMindest, nurCharge, ohneInaktive, sort]);

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
        extra={
          <label className="sortfeld" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="label" style={{ margin: 0 }}>Sortierung</span>
            <select
              className="input"
              name="sortierung"
              style={{ width: "auto" }}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sortierung"
            >
              {SORT_OPTIONEN.map((o) => (
                <option key={o.wert} value={o.wert}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        }
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
