"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { TemplatePositionZeile } from "@/db/queries";
import { templatePositionSetzen, templatePositionEntfernen } from "@/actions/templates";
import { Combobox, type ComboOption } from "@/components/Combobox";

type Artikel = { id: string; name: string; fach: string; einheit: string };

export function TemplatePosEditor({ templateId, positionen, artikel }: { templateId: string; positionen: TemplatePositionZeile[]; artikel: Artikel[] }) {
  const [pending, start] = useTransition();
  const [fach, setFach] = useState("");
  const [neuFach, setNeuFach] = useState(false);
  const [artikelId, setArtikelId] = useState("");
  const [soll, setSoll] = useState(1);

  const faecher = [...new Set(positionen.map((p) => p.fachLabel))];
  const freitext = neuFach || faecher.length === 0;

  // Fächer A–Z; „Neues Fach“ bewusst als letzte Aktion (daher selbst sortiert, Combobox nicht).
  const fachOptionen: ComboOption[] = [
    ...[...faecher].sort((a, b) => a.localeCompare(b, "de")).map((f) => ({ value: f, label: f })),
    { value: "__neu__", label: "+ Neues Fach…" },
  ];

  function add() {
    if (!fach.trim() || !artikelId || soll < 1) return;
    start(async () => {
      await templatePositionSetzen({ templateId, fachLabel: fach.trim(), artikelId, soll });
      setNeuFach(false);
      setArtikelId("");
      setSoll(1);
    });
  }

  return (
    <div className="card">
      {positionen.length === 0 && <div className="cardpad">Keine Positionen – unten hinzufügen.</div>}
      {faecher.map((f) => (
        <div key={f}>
          <div className="fachhead">{f}</div>
          {positionen.filter((p) => p.fachLabel === f).map((p) => (
            <div className="row" key={p.id}>
              <div className="rowmain">
                <div className="rowname">{p.artikelName}</div>
                <div className="rowmeta"><span className="fach">{p.handlagerFach}</span><small>{p.einheit}</small></div>
              </div>
              <input className="input qty" type="number" min={1} defaultValue={p.soll}
                onBlur={(e) => { const n = Number(e.target.value); if (n >= 1 && n !== p.soll) start(async () => { await templatePositionSetzen({ id: p.id, templateId, fachLabel: p.fachLabel, artikelId: p.artikelId, soll: n, sort: p.sort }); }); }} />
              <button className="btn-icon" aria-label="Position entfernen" disabled={pending} onClick={() => start(async () => { await templatePositionEntfernen({ id: p.id }); })}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      ))}
      <div className="addrow">
        {freitext ? (
          <>
            <input className="input" placeholder="Neues Fach, z. B. Schrank 1" value={fach} autoFocus={neuFach} onChange={(e) => setFach(e.target.value)} />
            {faecher.length > 0 && (
              <button className="btn btn-ghost slim" onClick={() => { setNeuFach(false); setFach(""); }}>Abbrechen</button>
            )}
          </>
        ) : (
          <Combobox
            options={fachOptionen}
            value={fach}
            onChange={(v) => { if (v === "__neu__") { setNeuFach(true); setFach(""); } else setFach(v); }}
            placeholder="Fach wählen…"
            sort={false}
            ariaLabel="Fach"
          />
        )}
        <Combobox
          options={artikel.map((a) => ({ value: a.id, label: a.name, keywords: a.fach }))}
          value={artikelId}
          onChange={setArtikelId}
          placeholder="Artikel wählen…"
          emptyText="Kein Artikel gefunden"
          ariaLabel="Artikel"
        />
        <input className="input qty" type="number" min={1} value={soll} onChange={(e) => setSoll(Number(e.target.value))} />
        <button className="btn btn-rot slim" disabled={pending || !fach.trim() || !artikelId} onClick={add}><Plus size={15} /> Position</button>
      </div>
    </div>
  );
}
