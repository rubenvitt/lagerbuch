import Link from "next/link";
import { ChevronRight, AlertTriangle, ScanBarcode, HeartPulse, Package } from "lucide-react";
import { getDb } from "@/db";
import { geraeteUebersicht } from "@/db/geraete";
import { lagerortOptionen } from "@/db/bz";
import { geraetFaelligChip } from "@/lib/format";
import { NeuGeraet } from "./NeuGeraet";

export const dynamic = "force-dynamic";

export default function GeraetePage() {
  const db = getDb();
  const geraete = geraeteUebersicht(db);
  const optionen = lagerortOptionen(db);
  const aktive = geraete.filter((g) => g.aktiv);
  const mtkFaellig = aktive.filter((g) => g.typ === "medizin" && !g.faelligkeit.keinDatum && g.faelligkeit.ampel !== "gruen").length;
  const mtkUeberfaellig = aktive.filter((g) => g.typ === "medizin" && g.faelligkeit.ueberfaellig).length;
  const objektAblaufend = aktive.filter((g) => g.typ === "objekt" && !g.faelligkeit.keinDatum && g.faelligkeit.ampel !== "gruen").length;

  return (
    <>
      <div className="mainhead">
        <h1>Geräte</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn btn-tinte slim" href="/verwaltung/geraete/scan" style={{ textDecoration: "none" }}>
            <ScanBarcode size={15} /> Scannen
          </Link>
          <NeuGeraet lagerorte={optionen} />
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{aktive.length}</b><div>Aktive Geräte</div></div>
        <div className={`kpi ${mtkFaellig ? "gelb" : "ok"}`}><b>{mtkFaellig}</b><div>MTK fällig/bald</div></div>
        <div className={`kpi ${mtkUeberfaellig ? "rot" : "ok"}`}><b>{mtkUeberfaellig}</b><div>MTK überfällig</div></div>
        <div className={`kpi ${objektAblaufend ? "gelb" : "ok"}`}><b>{objektAblaufend}</b><div>Objekte ablaufend</div></div>
      </div>

      {geraete.length === 0 && <div className="card cardpad">Noch keine Geräte. Lege oben das erste an.</div>}
      {geraete.length > 0 && (
        <div className="card">
          {geraete.map((g) => {
            const fi = geraetFaelligChip(g.typ, g.faelligkeit);
            const TypIcon = g.typ === "medizin" ? HeartPulse : Package;
            return (
              <Link className="row" key={g.id} href={`/verwaltung/geraete/${g.id}`}>
                <div className="rowmain">
                  <div className="rowname">
                    {g.name}
                    {g.barcode ? <span className="mono" style={{ marginLeft: 8, color: "var(--stahl)" }}>{g.barcode}</span> : null}
                  </div>
                  <div className="rowmeta">
                    <span className="chip chip-grau" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <TypIcon size={11} /> {g.typ === "medizin" ? "Medizin" : "Objekt"}
                    </span>
                    {!g.aktiv && <span className="chip chip-grau">inaktiv</span>}
                    <small>{g.lagerortName}</small>
                    {fi && (
                      <span className={`chip chip-${fi.tone}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {fi.tone === "rot" && <AlertTriangle size={11} />} {fi.text}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: "var(--stahl)", flex: "none" }} />
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
