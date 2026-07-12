import { getDb } from "@/db";
import { etikettenDaten } from "@/db/etiketten";
import { EtikettenBogen } from "./EtikettenBogen";

export const dynamic = "force-dynamic";

export default async function EtikettenPage() {
  const { artikel, tokens } = await etikettenDaten(getDb());
  return (
    <>
      <div className="mainhead no-print"><h1>Etiketten</h1></div>
      <p className="footnote no-print" style={{ marginBottom: 12 }}>Artikel- und Token-Etiketten mit QR-Deep-Link. Auswählen und drucken – im Druck erscheinen nur gewählte Etiketten im 48,5 × 25,4 mm-Raster.</p>
      <EtikettenBogen
        artikel={artikel.map((a) => ({ id: a.id, name: a.name, fach: a.fach, qr: a.qr }))}
        tokens={tokens.map((t) => ({ code: t.code, label: t.label, qr: t.qr }))}
      />
    </>
  );
}
