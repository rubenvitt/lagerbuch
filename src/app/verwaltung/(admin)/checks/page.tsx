import { getDb } from "@/db";
import { checkHistorie } from "@/db/queries";
import { fmtTs } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function ChecksPage() {
  const checks = checkHistorie(getDb());
  return (
    <>
      <div className="mainhead"><h1>Fahrzeug-Checks</h1></div>
      {checks.length === 0 && <div className="card cardpad">Noch keine Checks durchgeführt.</div>}
      <div className="card">
        {checks.map((c) => (
          <div className="row" key={c.id}>
            <div className="rowmain">
              <div className="rowname">{c.fahrzeugName}</div>
              <div className="rowmeta">
                <span className="jts">{c.completedAt ? fmtTs(c.completedAt) : "–"}</span>
                {c.nachgefuelltGesamt > 0 && <span className="chip chip-rot">{c.nachgefuelltGesamt} aus Handlager nachgefüllt</span>}
                {c.korrigiertGesamt > 0 && <span className="chip chip-gelb">{c.korrigiertGesamt} korrigiert</span>}
                {c.nachgefuelltGesamt === 0 && c.korrigiertGesamt === 0 && <span className="chip chip-ok">vollständig</span>}
              </div>
            </div>
            <div className="bignum" style={{ fontSize: 18 }}>{c.positionen}<small>Pos.</small></div>
          </div>
        ))}
      </div>
    </>
  );
}
