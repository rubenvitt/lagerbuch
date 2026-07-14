import Link from "next/link";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { getDb } from "@/db";
import { o2FlaschenUebersicht, lagerorteFuerFlaschen } from "@/db/sauerstoff";
import { chipTone } from "@/lib/format";
import { NeuFlasche } from "./NeuFlasche";

export const dynamic = "force-dynamic";

export default function SauerstoffPage() {
  const db = getDb();
  const flaschen = o2FlaschenUebersicht(db);
  const lagerorte = lagerorteFuerFlaschen(db);
  const aktive = flaschen.filter((f) => f.aktiv);
  const niedrig = aktive.filter((f) => f.status?.niedrig).length;

  return (
    <>
      <div className="mainhead">
        <h1>Sauerstoff</h1>
        <NeuFlasche lagerorte={lagerorte} />
      </div>

      <div className="kpis">
        <div className="kpi"><b>{aktive.length}</b><div>Aktive Flaschen</div></div>
        <div className={`kpi ${niedrig ? "rot" : "ok"}`}><b>{niedrig}</b><div>Niedriger Druck</div></div>
      </div>

      {flaschen.length === 0 && <div className="card cardpad">Noch keine Flaschen. Lege oben die erste an.</div>}
      {flaschen.length > 0 && (
        <div className="card">
          {flaschen.map((f) => (
            <Link className="row" key={f.id} href={`/verwaltung/sauerstoff/${f.id}`}>
              <div className="rowmain">
                <div className="rowname">
                  {f.name}
                  <span className="mono" style={{ marginLeft: 8, color: "var(--stahl)" }}>{f.lagerortName}</span>
                </div>
                <div className="rowmeta">
                  {!f.aktiv && <span className="chip chip-grau">inaktiv</span>}
                  {f.status ? (
                    <>
                      <span className={`chip chip-${chipTone(f.status.ampel)}`}>{f.status.prozent}%</span>
                      {f.status.niedrig && <span className="chip chip-rot"><AlertTriangle size={11} /> niedriger Druck</span>}
                    </>
                  ) : (
                    <span className="chip chip-grau">keine Messung</span>
                  )}
                  <small>{f.groesseLiter ? `${f.groesseLiter} l · ` : ""}Nenndruck {f.nennfuelldruckBar} bar</small>
                </div>
              </div>
              <div className="bignum" style={{ fontSize: 18, flex: "none" }}>
                {f.letzterDruck !== null ? f.letzterDruck : "–"}<small>bar</small>
              </div>
              <ChevronRight size={18} style={{ color: "var(--stahl)", flex: "none" }} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
