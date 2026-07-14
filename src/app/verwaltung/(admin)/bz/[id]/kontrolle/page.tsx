import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ScanBarcode, Info } from "lucide-react";
import { getDb } from "@/db";
import { bzGeraetDetail } from "@/db/bz";
import { fmtTs, chipTone } from "@/lib/format";
import { KontrolleForm } from "../KontrolleForm";

export const dynamic = "force-dynamic";

/**
 * Fokussierter Kontroll-Flow fürs Handy: Ziel des Scanners. Nur das Nötigste –
 * Gerät + Fälligkeit oben, Erfassungsformular, dann weiter zum nächsten Gerät.
 * Referenz-Pflege, Logbuch und Gefahrenzone bleiben auf der Detailseite.
 */
export default async function BzKontrollePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = bzGeraetDetail(getDb(), id);
  if (!detail) notFound();
  const { geraet: g, lagerortName, faelligkeit, logbuch } = detail;
  const letzte = logbuch[0] ?? null;
  const faelligText = faelligkeit.nieGeprueft
    ? "noch nie geprüft"
    : faelligkeit.ueberfaellig
      ? `überfällig seit ${Math.abs(faelligkeit.tageBisFaellig ?? 0)} T`
      : faelligkeit.tageBisFaellig === 0
        ? "heute fällig"
        : `fällig in ${faelligkeit.tageBisFaellig} T`;

  return (
    <>
      <Link className="backlink" href="/verwaltung/bz/scan"><ArrowLeft size={15} /> Scanner</Link>
      <div className="mainhead">
        <h1>
          {g.name}
          {g.barcode ? <span className="mono" style={{ marginLeft: 10, color: "var(--stahl)", fontSize: 15 }}>{g.barcode}</span> : null}
        </h1>
      </div>

      <div className="card cardpad" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className={`chip chip-${chipTone(faelligkeit.ampel)}`}>{faelligText}</span>
        {!g.aktiv && <span className="chip chip-grau">inaktiv</span>}
        <small style={{ color: "var(--stahl)" }}>{lagerortName}</small>
        <small style={{ color: "var(--stahl)" }}>
          · zuletzt {letzte ? `${fmtTs(letzte.ts)} (${letzte.bestanden ? "bestanden" : "nicht bestanden"}, ${letzte.wer})` : "–"}
        </small>
        {g.streifenLot && <small style={{ color: "var(--stahl)" }}>· Lot {g.streifenLot}</small>}
      </div>

      <h2 className="secthead">Kontrolle erfassen</h2>
      <KontrolleForm
        geraetId={g.id}
        level1={{ label: g.level1Label, min: g.level1Min, max: g.level1Max }}
        level2={{ label: g.level2Label, min: g.level2Min, max: g.level2Max }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <Link className="btn btn-tinte slim" href="/verwaltung/bz/scan" style={{ textDecoration: "none" }}>
          <ScanBarcode size={15} /> Nächstes Gerät scannen
        </Link>
        <Link className="btn btn-ghost slim" href={`/verwaltung/bz/${g.id}`} style={{ textDecoration: "none" }}>
          <Info size={15} /> Gerätedetails &amp; Logbuch
        </Link>
      </div>
    </>
  );
}
