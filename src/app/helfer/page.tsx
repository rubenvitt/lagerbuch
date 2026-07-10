import { getDb } from "@/db";
import { artikelListe } from "@/db/queries";
import { HelferListe } from "@/components/HelferListe";

export const dynamic = "force-dynamic";

export default function HelferHome() {
  const artikel = artikelListe(getDb()).map((a) => ({ id: a.id, name: a.name, einheit: a.einheit, fach: a.fach, bestand: a.bestand }));
  return (
    <>
      <div className="screenhead">Artikel wählen</div>
      <p className="footnote" style={{ marginBottom: 8 }}>Regaletikett scannen öffnet den Artikel direkt — oder hier suchen.</p>
      <HelferListe artikel={artikel} />
    </>
  );
}
