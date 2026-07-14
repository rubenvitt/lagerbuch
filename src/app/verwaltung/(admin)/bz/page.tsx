import Link from "next/link";
import { ChevronRight, AlertTriangle, ScanBarcode } from "lucide-react";
import { getDb } from "@/db";
import { bzGeraeteUebersicht, bzAkkuKennzahlGesamt, lagerortOptionen } from "@/db/bz";
import { fmtTs, chipTone } from "@/lib/format";
import { NeuGeraet } from "./NeuGeraet";

export const dynamic = "force-dynamic";

function faelligText(f: ReturnType<typeof bzGeraeteUebersicht>[number]["faelligkeit"]): string {
  if (f.nieGeprueft) return "noch nie geprüft";
  if (f.ueberfaellig) return `überfällig (seit ${Math.abs(f.tageBisFaellig ?? 0)} Tagen)`;
  if (f.tageBisFaellig === 0) return "heute fällig";
  return `fällig in ${f.tageBisFaellig} Tagen`;
}

export default function BzPage() {
  const db = getDb();
  const geraete = bzGeraeteUebersicht(db);
  const optionen = lagerortOptionen(db);
  const akku = bzAkkuKennzahlGesamt(db);
  const aktive = geraete.filter((g) => g.aktiv);
  const faellig = aktive.filter((g) => g.faelligkeit.ampel !== "gruen").length;
  const ueberfaellig = aktive.filter((g) => g.faelligkeit.ueberfaellig || g.faelligkeit.nieGeprueft).length;

  return (
    <>
      <div className="mainhead">
        <h1>BZ-Kontrolle</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn btn-tinte slim" href="/verwaltung/bz/scan" style={{ textDecoration: "none" }}>
            <ScanBarcode size={15} /> Scannen
          </Link>
          <NeuGeraet lagerorte={optionen} />
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{aktive.length}</b><div>Aktive Geräte</div></div>
        <div className={`kpi ${faellig ? "gelb" : "ok"}`}><b>{faellig}</b><div>Kontrolle fällig/bald</div></div>
        <div className={`kpi ${ueberfaellig ? "rot" : "ok"}`}><b>{ueberfaellig}</b><div>Überfällig / nie geprüft</div></div>
        <div className="kpi"><b>{akku.tageDurchschnitt !== null ? `${Math.round(akku.tageDurchschnitt)} T` : "–"}</b><div>Ø Akku-Lebensdauer</div></div>
      </div>

      {geraete.length === 0 && <div className="card cardpad">Noch keine BZ-Geräte. Lege oben das erste an.</div>}
      {geraete.length > 0 && (
        <div className="card">
          {geraete.map((g) => (
            <Link className="row" key={g.id} href={`/verwaltung/bz/${g.id}`}>
              <div className="rowmain">
                <div className="rowname">
                  {g.name}
                  {g.barcode ? <span className="mono" style={{ marginLeft: 8, color: "var(--stahl)" }}>{g.barcode}</span> : null}
                </div>
                <div className="rowmeta">
                  {!g.aktiv && <span className="chip chip-grau">inaktiv</span>}
                  <small>{g.lagerortName}</small>
                  <span className={`chip chip-${chipTone(g.faelligkeit.ampel)}`}>
                    {g.faelligkeit.ampel === "rot" && <AlertTriangle size={11} />} {faelligText(g.faelligkeit)}
                  </span>
                  <small>· {g.letzteKontrolle ? `zuletzt ${fmtTs(g.letzteKontrolle)}` : "–"}</small>
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
