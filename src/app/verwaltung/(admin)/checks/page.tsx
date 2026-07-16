import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getDb } from "@/db";
import { checkHistorie, fahrzeugListe } from "@/db/queries";
import { fmtTs, parseDatumGrenze } from "@/lib/format";
import { ChecksFilter } from "./ChecksFilter";

export const dynamic = "force-dynamic";

export default async function ChecksPage({
  searchParams,
}: {
  searchParams: Promise<{ fz?: string; von?: string; bis?: string }>;
}) {
  const sp = await searchParams;
  const db = getDb();
  const fahrzeuge = fahrzeugListe(db)
    .map((f) => ({ id: f.id, name: f.name, kennung: f.kennung }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const fz = fahrzeuge.some((f) => f.id === sp.fz) ? sp.fz! : "";
  const von = sp.von ?? "";
  const bis = sp.bis ?? "";

  const checks = checkHistorie(db, {
    fahrzeugId: fz || undefined,
    von: parseDatumGrenze(von, false),
    bis: parseDatumGrenze(bis, true),
  });

  return (
    <>
      <div className="mainhead"><h1>Fahrzeug-Checks</h1></div>
      <ChecksFilter fz={fz} von={von} bis={bis} fahrzeuge={fahrzeuge} />
      {checks.length === 0 ? (
        <div className="card"><div className="empty">Keine Checks gefunden.</div></div>
      ) : (
        <div className="card">
          {checks.map((c) => (
            <Link className="row" key={c.id} href={`/verwaltung/checks/${c.id}`}>
              <div className="rowmain">
                <div className="rowname">{c.fahrzeugName}</div>
                <div className="rowmeta">
                  <span className="jts">{c.completedAt ? fmtTs(c.completedAt) : "–"}</span>
                  {c.nachgefuelltGesamt > 0 && <span className="chip chip-rot">{c.nachgefuelltGesamt} aus Handlager nachgefüllt</span>}
                  {c.korrigiertGesamt > 0 && <span className="chip chip-gelb">{c.korrigiertGesamt} korrigiert</span>}
                  {c.offenGesamt > 0 && <span className="chip chip-rot">{c.offenGesamt} fehlt weiterhin</span>}
                  {c.geraeteAuffaellig > 0 && <span className="chip chip-rot">{c.geraeteAuffaellig} Gerät(e) auffällig</span>}
                  {c.flaschenAuffaellig > 0 && <span className="chip chip-rot">{c.flaschenAuffaellig} Flasche(n) niedrig</span>}
                  {c.nachgefuelltGesamt === 0 && c.korrigiertGesamt === 0 && c.offenGesamt === 0 && c.geraeteAuffaellig === 0 && c.flaschenAuffaellig === 0 && <span className="chip chip-ok">vollständig</span>}
                </div>
              </div>
              <div className="bignum" style={{ fontSize: 18 }}>{c.positionen}<small>Pos.</small></div>
              <ChevronRight size={18} style={{ color: "var(--stahl)", flex: "none" }} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
