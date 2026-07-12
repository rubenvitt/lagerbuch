"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SollZeile } from "@/db/queries";
import { sollPositionSetzen, sollPositionEntfernen } from "@/actions/fahrzeuge";

type Artikel = { id: string; name: string; fach: string; einheit: string };

export function SollEditor({ fahrzeugId, positionen, artikel }: { fahrzeugId: string; positionen: SollZeile[]; artikel: Artikel[] }) {
  const [pending, start] = useTransition();
  const [fach, setFach] = useState("");
  const [artikelId, setArtikelId] = useState("");
  const [soll, setSoll] = useState(1);

  const faecher = [...new Set(positionen.map((p) => p.fachLabel))];

  function add() {
    if (!fach.trim() || !artikelId || soll < 1) return;
    start(async () => { await sollPositionSetzen({ fahrzeugId, fachLabel: fach.trim(), artikelId, soll }); setArtikelId(""); setSoll(1); });
  }

  return (
    <div className="card">
      {positionen.length === 0 && <div className="cardpad">Kein Soll definiert – unten Positionen hinzufügen.</div>}
      {faecher.map((f) => (
        <div key={f}>
          <div className="fachhead">{f}</div>
          {positionen.filter((p) => p.fachLabel === f).map((p) => (
            <div className="row" key={p.id}>
              <div className="rowmain">
                <div className="rowname">{p.artikelName}</div>
                <div className="rowmeta"><span className="fach">{p.handlagerFach}</span><small>auf Fzg. {p.fahrzeugBestand} · Handlager {p.handlagerBestand} {p.einheit}</small></div>
              </div>
              <input className="input" style={{ width: 64, flex: "none" }} type="number" min={1} defaultValue={p.soll}
                onBlur={(e) => { const n = Number(e.target.value); if (n >= 1 && n !== p.soll) start(async () => { await sollPositionSetzen({ id: p.id, fahrzeugId, fachLabel: p.fachLabel, artikelId: p.artikelId, soll: n, sort: p.sort }); }); }} />
              <button className="btn btn-ghost" style={{ flex: "none", width: "auto" }} disabled={pending} onClick={() => start(async () => { await sollPositionEntfernen({ id: p.id }); })}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      ))}
      <div className="cardpad" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--linie)" }}>
        <input className="input" placeholder="Fach, z. B. Schrank 1" value={fach} onChange={(e) => setFach(e.target.value)} style={{ minWidth: 150 }} />
        <select className="input" value={artikelId} onChange={(e) => setArtikelId(e.target.value)}>
          <option value="">Artikel wählen…</option>
          {artikel.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className="input" style={{ width: 70 }} type="number" min={1} value={soll} onChange={(e) => setSoll(Number(e.target.value))} />
        <button className="btn btn-rot" disabled={pending || !fach.trim() || !artikelId} onClick={add}><Plus size={15} /> Position</button>
      </div>
    </div>
  );
}
