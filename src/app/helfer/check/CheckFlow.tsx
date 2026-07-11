"use client";
import { useState, useTransition } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { checkAbschluss } from "@/actions/check";
import { fehlmengen } from "@/lib/domain/check";

type Pos = { id: string; fachLabel: string; artikelId: string; artikelName: string; einheit: string; handlagerFach: string; soll: number; bestand: number };
type Fahrzeug = { id: string; name: string; kennung: string | null };

export function CheckFlow({ fahrzeuge, soll }: { fahrzeuge: Fahrzeug[]; soll: Record<string, Pos[]> }) {
  const [vehId, setVehId] = useState<string | null>(fahrzeuge.length === 1 ? fahrzeuge[0].id : null);
  const [ist, setIst] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (fahrzeuge.length === 0) return <div className="card cardpad">Keine Fahrzeuge angelegt. Die Verwaltung muss zuerst ein Fahrzeug + Soll pflegen.</div>;

  if (!vehId) return (
    <>
      <div className="screenhead">Fahrzeug wählen</div>
      <div className="card">
        {fahrzeuge.map((f) => (
          <button className="row" key={f.id} onClick={() => setVehId(f.id)} style={{ width: "100%", textAlign: "left", background: "none", border: 0 }}>
            <div className="rowmain"><div className="rowname">{f.name}</div>{f.kennung && <div className="rowmeta"><small>{f.kennung}</small></div>}</div>
          </button>
        ))}
      </div>
    </>
  );

  const veh = fahrzeuge.find((f) => f.id === vehId)!;
  const positionen = soll[vehId] ?? [];
  const faecher = [...new Set(positionen.map((p) => p.fachLabel))];
  const mitIst = positionen.map((p) => ({ ...p, ist: ist[p.id] ?? p.soll }));
  const fehl = fehlmengen(mitIst); // {..., fehlt}
  const fehlSumme = fehl.reduce((s, f) => s + f.fehlt, 0);

  function abschluss() {
    start(async () => {
      await checkAbschluss({ fahrzeugId: vehId!, positionen: positionen.map((p) => ({ sollPositionId: p.id, ist: ist[p.id] ?? p.soll })) });
      setMsg(`Check abgeschlossen – ${fehl.length} Fehlposition(en) abgebucht`);
      setIst({});
    });
  }

  if (msg) return (
    <>
      <div className="card cardpad"><div className="chip chip-ok" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={14} /> {msg}</div></div>
      <button className="btn btn-ghost" onClick={() => { setMsg(null); setVehId(fahrzeuge.length === 1 ? vehId : null); }}>Weiterer Check</button>
    </>
  );

  return (
    <>
      <div className="screenhead">{veh.name}{veh.kennung ? ` · ${veh.kennung}` : ""}</div>
      {positionen.length === 0 && <div className="card cardpad">Kein Soll für dieses Fahrzeug definiert.</div>}
      {faecher.map((fach) => (
        <div key={fach}>
          <div className="fachhead">{fach}</div>
          <div className="card">
            {positionen.filter((p) => p.fachLabel === fach).map((p) => {
              const wert = ist[p.id] ?? p.soll;
              const fehlt = Math.max(0, p.soll - wert);
              return (
                <div className="row" key={p.id}>
                  <div className={`checkcircle ${fehlt > 0 ? "fehl" : "done"}`}>{fehlt > 0 ? <AlertTriangle size={14} /> : <Check size={16} />}</div>
                  <div className="rowmain">
                    <div className="rowname">{p.artikelName}</div>
                    <div className="rowmeta"><small>Soll {p.soll} {p.einheit}</small>{fehlt > 0 && <span className="chip chip-rot">fehlt {fehlt}</span>}</div>
                  </div>
                  <Stepper sm wert={wert} min={0} max={p.soll} setWert={(v) => setIst((s) => ({ ...s, [p.id]: v }))} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {positionen.length > 0 && (
        <div className="summary">
          <div className="info">
            {fehlSumme > 0
              ? (<><b>{fehlSumme} Teile fehlen</b><div>{fehl.length} Position(en) aus dem Handlager · {fehl.map((f) => f.handlagerFach).join(", ")}</div></>)
              : (<><b>Alles vollständig</b><div>Check kann abgeschlossen werden</div></>)}
          </div>
          <button className="go" disabled={pending} onClick={abschluss}>Abschließen</button>
        </div>
      )}
    </>
  );
}
