"use client";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { inventurKorrektur } from "@/actions/inventur";

type Artikel = { id: string; name: string; einheit: string; fach: string; bestand: number };

export function InventurForm({ artikel }: { artikel: Artikel[] }) {
  const [ist, setIst] = useState<Record<string, number>>({});
  const [kommentar, setKommentar] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const abweichungen = artikel.filter((a) => (ist[a.id] ?? a.bestand) !== a.bestand);

  function abschluss() {
    setErr(null);
    if (!kommentar.trim()) { setErr("Kommentar erforderlich"); return; }
    start(async () => {
      try {
        const r = await inventurKorrektur({ kommentar: kommentar.trim(), positionen: artikel.map((a) => ({ artikelId: a.id, ist: ist[a.id] ?? a.bestand })) });
        setMsg(`Inventur gebucht – ${r.korrigiert} Position(en) korrigiert`);
        setIst({}); setKommentar("");
      } catch (e) { setErr(e instanceof Error ? e.message : "Fehler bei der Inventur"); }
    });
  }

  if (msg) return (
    <>
      <div className="card cardpad"><div className="chip chip-ok" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={14} /> {msg}</div></div>
    </>
  );

  return (
    <>
      {artikel.length === 0 && <div className="card cardpad">Keine Artikel vorhanden.</div>}
      <div className="card">
        {artikel.map((a) => {
          const wert = ist[a.id] ?? a.bestand;
          const diff = wert - a.bestand;
          return (
            <div className="row" key={a.id}>
              <div className="rowmain">
                <div className="rowname">{a.name}</div>
                <div className="rowmeta"><span className="fach">{a.fach}</span><small>Bestand {a.bestand} {a.einheit}</small>
                  {diff !== 0 && <span className={`chip ${diff < 0 ? "chip-rot" : "chip-gelb"}`}>{diff > 0 ? "+" : ""}{diff}</span>}</div>
              </div>
              <Stepper sm min={0} max={9999} wert={wert} setWert={(v) => setIst((s) => ({ ...s, [a.id]: v }))} />
            </div>
          );
        })}
      </div>
      <div className="card cardpad" style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <input className="input" placeholder="Kommentar (Pflicht), z. B. Quartalsinventur 07/2026" value={kommentar} onChange={(e) => { setKommentar(e.target.value); setErr(null); }} />
        {err && <div className="gateerr">{err}</div>}
        <button className="btn btn-rot" disabled={pending || !kommentar.trim()} onClick={abschluss}>
          Inventur abschließen ({abweichungen.length} Abweichung{abweichungen.length === 1 ? "" : "en"})
        </button>
      </div>
    </>
  );
}
