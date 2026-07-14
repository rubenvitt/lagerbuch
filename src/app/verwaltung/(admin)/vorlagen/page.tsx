import Link from "next/link";
import { ChevronRight, Truck } from "lucide-react";
import { getDb } from "@/db";
import { templateUebersicht } from "@/db/queries";
import { NeuTemplate } from "./NeuTemplate";

export const dynamic = "force-dynamic";

export default function VorlagenPage() {
  const vorlagen = templateUebersicht(getDb());
  return (
    <>
      <div className="mainhead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Vorlagen</h1>
        <NeuTemplate />
      </div>
      <p style={{ color: "var(--stahl)", fontSize: 13.5, margin: "0 2px 14px" }}>
        Bestückung einmal definieren und auf mehrere identisch gepackte Fahrzeuge übertragen. Pro Fahrzeug bleiben manuelle Abweichungen möglich.
      </p>
      {vorlagen.length === 0 && <div className="card cardpad">Noch keine Vorlagen. Lege oben die erste an – oder erstelle eine Vorlage direkt aus einem gepackten Fahrzeug.</div>}
      {vorlagen.length > 0 && (
        <div className="card">
          {vorlagen.map((t) => (
            <Link className="row" key={t.id} href={`/verwaltung/vorlagen/${t.id}`}>
              <div className="rowmain">
                <div className="rowname">
                  {t.name}
                  {!t.aktiv && <span className="chip chip-grau" style={{ marginLeft: 8 }}>inaktiv</span>}
                </div>
                <div className="rowmeta">
                  <small>
                    {t.positionen} Position{t.positionen === 1 ? "" : "en"}
                    {t.faecher > 0 ? ` · ${t.faecher} ${t.faecher === 1 ? "Fach" : "Fächer"}` : ""}
                  </small>
                  <span className="chip chip-grau"><Truck size={11} /> {t.fahrzeuge} Fahrzeug{t.fahrzeuge === 1 ? "" : "e"}</span>
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
