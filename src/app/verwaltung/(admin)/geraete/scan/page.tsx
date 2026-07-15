import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GeraetScanner } from "./GeraetScanner";

export default function GeraeteScanPage() {
  return (
    <>
      <Link className="backlink" href="/verwaltung/geraete"><ArrowLeft size={15} /> Geräte</Link>
      <div className="mainhead">
        <h1>Gerät scannen</h1>
        <p>Barcode auf dem Gerät vor die Kamera halten – bei Treffer geht es direkt zum Gerät.</p>
      </div>
      <GeraetScanner />
      <p className="footnote">
        Kamera-Zugriff braucht HTTPS (oder localhost). Ohne Kamera funktioniert die manuelle Eingabe.
      </p>
    </>
  );
}
