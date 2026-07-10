import { getDb } from "@/db";
import { tokenListe } from "@/db/queries";
import { TokenTable } from "./TokenTable";
import { NeuToken } from "./NeuToken";

export const dynamic = "force-dynamic";

export default function TokensPage() {
  const tokens = tokenListe(getDb());
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ font: "700 24px var(--display)" }}>Zugangs-Codes</h1>
        <NeuToken />
      </div>
      <p className="footnote" style={{ marginBottom: 12 }}>
        Codes hängen laminiert im Fahrzeug/am Regal. Sperren wirkt sofort — die nächste Buchung eines gesperrten Codes wird abgewiesen.
      </p>
      <TokenTable tokens={tokens} />
    </div>
  );
}
