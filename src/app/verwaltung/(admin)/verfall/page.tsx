import { getDb } from "@/db";
import { verfallListe } from "@/db/queries";
import { VerfallItem } from "./VerfallItem";
import { AussondernRow } from "./AussondernRow";

export const dynamic = "force-dynamic";

export default function VerfallPage() {
  const eintraege = verfallListe(getDb());
  const abgelaufen = eintraege.filter((e) => e.abgelaufen);
  const kritisch = eintraege.filter((e) => !e.abgelaufen && e.ampel === "rot");
  const faellig = eintraege.filter((e) => !e.abgelaufen && e.ampel === "gelb");

  return (
    <>
      <div className="mainhead"><h1>Verfall</h1></div>
      {eintraege.length === 0 && <div className="card cardpad">Keine Chargen im Warnbereich – alles frisch.</div>}

      {abgelaufen.length > 0 && (
        <section>
          <h2 className="secthead">Abgelaufen — aussondern nötig ({abgelaufen.length})</h2>
          <div className="card">
            {abgelaufen.map((e) => <AussondernRow key={e.chargeId} eintrag={e} />)}
          </div>
        </section>
      )}
      {kritisch.length > 0 && (
        <section>
          <h2 className="secthead">Kritisch — läuft ab ({kritisch.length})</h2>
          <div className="card">{kritisch.map((e) => <VerfallItem key={e.chargeId} eintrag={e} />)}</div>
        </section>
      )}
      {faellig.length > 0 && (
        <section>
          <h2 className="secthead">Bald fällig ({faellig.length})</h2>
          <div className="card">{faellig.map((e) => <VerfallItem key={e.chargeId} eintrag={e} />)}</div>
        </section>
      )}
    </>
  );
}
