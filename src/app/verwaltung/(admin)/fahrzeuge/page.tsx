import Link from "next/link";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { getDb } from "@/db";
import { fahrzeugUebersicht } from "@/db/queries";
import { fmtTs } from "@/lib/format";
import { NeuFahrzeug } from "./NeuFahrzeug";

export const dynamic = "force-dynamic";

export default function FahrzeugePage() {
  const fahrzeuge = fahrzeugUebersicht(getDb());
  return (
    <>
      <div className="mainhead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Fahrzeuge</h1>
        <NeuFahrzeug />
      </div>
      {fahrzeuge.length === 0 && <div className="card cardpad">Noch keine Fahrzeuge. Lege oben das erste an.</div>}
      {fahrzeuge.length > 0 && (
        <div className="card">
          {fahrzeuge.map((f) => (
            <Link className="row" key={f.id} href={`/verwaltung/fahrzeuge/${f.id}`}>
              <div className="rowmain">
                <div className="rowname">
                  {f.name}
                  {f.kennung ? <span className="mono" style={{ marginLeft: 8, color: "var(--stahl)" }}>{f.kennung}</span> : null}
                </div>
                <div className="rowmeta">
                  {!f.aktiv && <span className="chip chip-grau">inaktiv</span>}
                  <small>
                    {f.positionen} Position{f.positionen === 1 ? "" : "en"}
                    {f.faecher > 0 ? ` · ${f.faecher} ${f.faecher === 1 ? "Fach" : "Fächer"}` : ""}
                  </small>
                  {f.artikelUnterSoll > 0 && (
                    <span className="chip chip-rot"><AlertTriangle size={11} /> {f.artikelUnterSoll} unter Soll</span>
                  )}
                  {f.positionen > 0 && f.artikelUnterSoll === 0 && <span className="chip chip-ok">auf Soll</span>}
                  <small>· {f.letzterCheck ? `zuletzt geprüft ${fmtTs(f.letzterCheck)}` : "noch nie geprüft"}</small>
                </div>
              </div>
              <ChevronRight size={18} style={{ color: "var(--stahl)", flex: "none" }} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
