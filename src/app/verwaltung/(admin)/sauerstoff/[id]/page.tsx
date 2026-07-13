import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getDb } from "@/db";
import { o2FlascheDetail } from "@/db/sauerstoff";
import { fmtTs } from "@/lib/format";
import { MessungForm } from "./MessungForm";
import { FlascheAktivToggle } from "./FlascheAktivToggle";

export const dynamic = "force-dynamic";

export default async function FlascheDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const detail = o2FlascheDetail(db, id);
  if (!detail) notFound();
  const { flasche, lagerortName, status, verlauf } = detail;
  const aktuellerDruck = verlauf.length > 0 ? verlauf[0].druckBar : null;

  return (
    <>
      <Link className="backlink" href="/verwaltung/sauerstoff"><ArrowLeft size={15} /> Sauerstoff</Link>
      <div className="mainhead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>
          {flasche.name}
          <span className="mono" style={{ marginLeft: 10, color: "var(--stahl)", fontSize: 15 }}>{lagerortName}</span>
        </h1>
        <FlascheAktivToggle id={flasche.id} aktiv={flasche.aktiv} />
      </div>

      <div className="kpis">
        <div className="kpi"><b>{aktuellerDruck !== null ? `${aktuellerDruck} bar` : "–"}</b><div>Aktueller Druck</div></div>
        <div className={`kpi ${status ? (status.ampel === "gruen" ? "ok" : status.ampel) : ""}`}><b>{status ? `${status.prozent}%` : "–"}</b><div>Füllstand</div></div>
        <div className="kpi"><b>{flasche.nennfuelldruckBar} bar</b><div>Nennfülldruck</div></div>
        <div className={`kpi ${flasche.aktiv ? "ok" : "gelb"}`}><b>{flasche.aktiv ? "aktiv" : "inaktiv"}</b><div>Status</div></div>
      </div>

      {status?.niedrig && (
        <div className="card cardpad" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--rot)", fontWeight: 600 }}>
          <AlertTriangle size={16} /> Niedriger Druck – Flasche prüfen oder tauschen.
        </div>
      )}

      <div className="cardtitle" style={{ padding: "16px 2px 8px" }}>Messung erfassen</div>
      <MessungForm flascheId={flasche.id} />

      <div className="cardtitle" style={{ padding: "18px 2px 8px" }}>Verlauf</div>
      {verlauf.length === 0 ? (
        <div className="card cardpad">Noch keine Messung erfasst.</div>
      ) : (
        <div className="card">
          {verlauf.map((m) => (
            <div className="row" key={m.id}>
              <div className="rowmain">
                <div className="rowname">{fmtTs(m.ts)}</div>
                <div className="rowmeta">
                  <small>{m.wer}</small>
                  {m.kommentar ? <small>· {m.kommentar}</small> : null}
                </div>
              </div>
              <div className="bignum" style={{ fontSize: 18, flex: "none" }}>{m.druckBar}<small>bar</small></div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
