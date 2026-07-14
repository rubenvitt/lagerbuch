import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GeraetScanner } from "./GeraetScanner";

// Der Scanner liegt bewusst im Admin-Bereich (Layout erzwingt isAdmin):
// BZ-Kontrollen macht nicht jeder Helfer mit öffentlichem Zugang.
export default function BzScanPage() {
  return (
    <>
      <Link className="backlink" href="/verwaltung/bz"><ArrowLeft size={15} /> BZ-Kontrolle</Link>
      <div className="mainhead">
        <h1>Gerät scannen</h1>
        <p>Barcode auf dem Gerät vor die Kamera halten – bei Treffer geht es direkt zur Kontrolle.</p>
      </div>
      <GeraetScanner />
      <p className="footnote">
        Kamera-Zugriff braucht HTTPS (oder localhost). Ohne Kamera funktioniert die manuelle Eingabe.
      </p>
    </>
  );
}
