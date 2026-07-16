import Link from "next/link";
import { ScanBarcode } from "lucide-react";
import { getDb } from "@/db";
import { bzGeraeteUebersicht, bzAkkuKennzahlGesamt, lagerortOptionen } from "@/db/bz";
import { NeuGeraet } from "./NeuGeraet";
import { BzListe } from "./BzListe";

export const dynamic = "force-dynamic";

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

      <BzListe geraete={geraete} />
    </>
  );
}
