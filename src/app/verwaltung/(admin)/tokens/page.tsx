import { getDb } from "@/db";
import { tokenListe, fahrzeugListe, artikelListe } from "@/db/queries";
import { TokenTable } from "./TokenTable";
import { NeuToken } from "./NeuToken";

export const dynamic = "force-dynamic";

export default function TokensPage() {
  const db = getDb();
  const tokens = tokenListe(db);
  const fahrzeuge = fahrzeugListe(db).filter((f) => f.aktiv).map((f) => ({ id: f.id, name: f.kennung ? `${f.name} · ${f.kennung}` : f.name }));
  const artikel = artikelListe(db).map((a) => ({ id: a.id, name: a.name }));
  return (
    <>
      <div className="mainhead">
        <h1>Zugangs-Codes</h1>
        <NeuToken fahrzeuge={fahrzeuge} artikel={artikel} />
      </div>
      <p className="footnote" style={{ marginBottom: 12 }}>
        Codes hängen laminiert im Fahrzeug/am Regal. Ein Code führt direkt zu seinem Ziel (Fahrzeug-Check oder Material). Sperren wirkt sofort — die nächste Buchung eines gesperrten Codes wird abgewiesen.
      </p>
      <TokenTable tokens={tokens} />
    </>
  );
}
