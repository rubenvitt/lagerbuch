import { getDb } from "@/db";
import { bestellvorschlag } from "@/db/queries";
import { BestellListe } from "./BestellListe";

export const dynamic = "force-dynamic";

export default function BestellungPage() {
  const zeilen = bestellvorschlag(getDb());
  return (
    <>
      <div className="mainhead"><h1>Bestellvorschlag</h1></div>
      <p className="footnote" style={{ marginBottom: 12 }}>Automatisch aus den Buchungen abgeleitet · Vorschlag = Faktor × Mindestbestand − Bestand. „Bestellt“ setzt sich beim nächsten Zugang automatisch zurück.</p>
      <BestellListe zeilen={zeilen} />
    </>
  );
}
