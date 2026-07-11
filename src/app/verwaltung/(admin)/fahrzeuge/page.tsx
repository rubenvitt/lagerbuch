import { getDb } from "@/db";
import { fahrzeugListe, sollFuerFahrzeug, artikelListe } from "@/db/queries";
import { NeuFahrzeug } from "./NeuFahrzeug";
import { SollEditor } from "./SollEditor";

export const dynamic = "force-dynamic";

export default function FahrzeugePage() {
  const db = getDb();
  const fahrzeuge = fahrzeugListe(db);
  const artikel = artikelListe(db).map((a) => ({ id: a.id, name: a.name, fach: a.fach, einheit: a.einheit }));
  return (
    <>
      <div className="mainhead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Fahrzeuge</h1>
        <NeuFahrzeug />
      </div>
      {fahrzeuge.length === 0 && <div className="card cardpad">Noch keine Fahrzeuge. Lege oben das erste an.</div>}
      {fahrzeuge.map((f) => (
        <section key={f.id} style={{ marginTop: 12 }}>
          <div className="cardtitle">{f.name}{f.kennung ? ` · ${f.kennung}` : ""}</div>
          <SollEditor fahrzeugId={f.id} positionen={sollFuerFahrzeug(db, f.id)} artikel={artikel} />
        </section>
      ))}
    </>
  );
}
