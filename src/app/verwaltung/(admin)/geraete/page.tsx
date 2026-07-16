import Link from "next/link";
import { ScanBarcode } from "lucide-react";
import { getDb } from "@/db";
import { geraeteUebersicht } from "@/db/geraete";
import { lagerortOptionen } from "@/db/bz";
import { NeuGeraet } from "./NeuGeraet";
import { GeraeteListe } from "./GeraeteListe";

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

      <GeraeteListe geraete={geraete} />
    </>
  );
}
