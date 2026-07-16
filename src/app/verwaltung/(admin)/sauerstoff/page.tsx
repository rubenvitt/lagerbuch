import { getDb } from "@/db";
import { o2FlaschenUebersicht, lagerorteFuerFlaschen } from "@/db/sauerstoff";
import { NeuFlasche } from "./NeuFlasche";
import { SauerstoffListe } from "./SauerstoffListe";

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

      <SauerstoffListe flaschen={flaschen} />
    </>
  );
}
