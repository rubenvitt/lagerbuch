import { getDb } from "@/db";
import { artikelListe } from "@/db/queries";
import { InventurForm } from "./InventurForm";

export const dynamic = "force-dynamic";

export default function InventurPage() {
  const artikel = artikelListe(getDb()).map((a) => ({ id: a.id, name: a.name, einheit: a.einheit, fach: a.fach, bestand: a.bestand }));
  return (
    <>
      <div className="mainhead"><h1>Inventur</h1></div>
      <p className="footnote" style={{ marginBottom: 12 }}>Gezählten Ist-Wert je Artikel eintragen. Abweichungen werden beim Abschluss als Korrektur gebucht (Bestand = Ist). Ein Pflicht-Kommentar dokumentiert die Zählung.</p>
      <InventurForm artikel={artikel} />
    </>
  );
}
