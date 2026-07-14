"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, RotateCcw } from "lucide-react";
import type { SollZeile } from "@/db/queries";
import { sollPositionSetzen, sollPositionEntfernen, sollPositionWiederherstellen } from "@/actions/fahrzeuge";

type Artikel = { id: string; name: string; fach: string; einheit: string };

export function SollEditor({ fahrzeugId, positionen, artikel, hatTemplate = false }: { fahrzeugId: string; positionen: SollZeile[]; artikel: Artikel[]; hatTemplate?: boolean }) {
  const [pending, start] = useTransition();
  const [fach, setFach] = useState("");
  const [neuFach, setNeuFach] = useState(false); // Modus: neues Fach per Freitext anlegen
  const [artikelId, setArtikelId] = useState("");
  const [soll, setSoll] = useState(1);

  const faecher = [...new Set(positionen.map((p) => p.fachLabel))];
  // Freitext nur im Neuanlage-Modus oder wenn es noch gar kein Fach gibt – sonst wird gewählt.
  const freitext = neuFach || faecher.length === 0;

  function add() {
    if (!fach.trim() || !artikelId || soll < 1) return;
    start(async () => {
      await sollPositionSetzen({ fahrzeugId, fachLabel: fach.trim(), artikelId, soll });
      // Fach bewusst gesetzt lassen (mehrere Artikel bequem ins selbe Fach legen); nach dem
      // Speichern existiert es als Option, daher raus aus dem Neuanlage-Modus.
      setNeuFach(false);
      setArtikelId("");
      setSoll(1);
    });
  }

  return (
    <div className="card">
      {positionen.length === 0 && <div className="cardpad">Kein Soll definiert – unten Positionen hinzufügen.</div>}
      {hatTemplate && positionen.length > 0 && (
        <div className="cardpad" style={{ fontSize: 12.5, color: "var(--stahl)", borderBottom: "1px solid var(--linie)" }}>
          Positionen aus der Vorlage. Ändern oder Entfernen gilt nur für dieses Fahrzeug und bleibt bei einem Sync erhalten.
        </div>
      )}
      {faecher.map((f) => (
        <div key={f}>
          <div className="fachhead">{f}</div>
          {positionen.filter((p) => p.fachLabel === f).map((p) => (
            <div className="row" key={p.id} style={p.entfernt ? { opacity: 0.55 } : undefined}>
              <div className="rowmain">
                <div className="rowname" style={p.entfernt ? { textDecoration: "line-through" } : undefined}>
                  {p.artikelName}
                  {p.herkunft === "vorlage" && <span className="chip chip-grau" style={{ marginLeft: 8 }}>Vorlage</span>}
                  {p.herkunft === "ueberschrieben" && <span className="chip chip-gelb" style={{ marginLeft: 8 }}>geändert</span>}
                  {p.entfernt && <span className="chip chip-grau" style={{ marginLeft: 8 }}>entfernt</span>}
                </div>
                <div className="rowmeta"><span className="fach">{p.handlagerFach}</span><small>auf Fzg. {p.fahrzeugBestand} · Handlager {p.handlagerBestand} {p.einheit}</small></div>
              </div>
              {p.entfernt ? (
                <button className="btn btn-ghost slim" style={{ flex: "none", width: "auto" }} disabled={pending} onClick={() => start(async () => { await sollPositionWiederherstellen({ id: p.id }); })}><RotateCcw size={15} /> Wiederherstellen</button>
              ) : (
                <>
                  <input className="input" style={{ width: 64, flex: "none" }} type="number" min={1} defaultValue={p.soll}
                    onBlur={(e) => { const n = Number(e.target.value); if (n >= 1 && n !== p.soll) start(async () => { await sollPositionSetzen({ id: p.id, fahrzeugId, fachLabel: p.fachLabel, artikelId: p.artikelId, soll: n, sort: p.sort }); }); }} />
                  <button className="btn btn-ghost" style={{ flex: "none", width: "auto" }} disabled={pending} onClick={() => start(async () => { await sollPositionEntfernen({ id: p.id }); })}><Trash2 size={15} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      <div className="cardpad" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--linie)" }}>
        {freitext ? (
          <>
            <input className="input" placeholder="Neues Fach, z. B. Schrank 1" value={fach} autoFocus={neuFach} onChange={(e) => setFach(e.target.value)} style={{ minWidth: 150 }} />
            {faecher.length > 0 && (
              <button className="btn btn-ghost slim" style={{ width: "auto", flex: "none" }} onClick={() => { setNeuFach(false); setFach(""); }}>Abbrechen</button>
            )}
          </>
        ) : (
          <select
            className="input"
            value={fach}
            onChange={(e) => { if (e.target.value === "__neu__") { setNeuFach(true); setFach(""); } else setFach(e.target.value); }}
            style={{ minWidth: 150 }}
          >
            <option value="">Fach wählen…</option>
            {faecher.map((f) => <option key={f} value={f}>{f}</option>)}
            <option value="__neu__">+ Neues Fach…</option>
          </select>
        )}
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
