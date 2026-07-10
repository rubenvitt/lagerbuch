import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getDb } from "@/db";
import { artikelListe, journalEintraege, kennzahlen } from "@/db/queries";
import { verfallStatus, type Ampel } from "@/lib/domain/verfall";
import { braucht } from "@/lib/domain/vorschlag";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtVerfall(v: string): string {
  const [y, m] = v.split("-");
  return `${m}/${y.slice(2)}`;
}

function fmtTs(ts: Date): string {
  return `${pad2(ts.getDate())}.${pad2(ts.getMonth() + 1)}. ${pad2(ts.getHours())}:${pad2(ts.getMinutes())}`;
}

function chargeText(status: { ampel: Ampel; abgelaufen: boolean }, verfall: string): string {
  if (status.abgelaufen) return "abgelaufen";
  if (status.ampel === "rot") return `läuft ${fmtVerfall(verfall)} ab`;
  return `fällig ${fmtVerfall(verfall)}`;
}

const TYP_LABEL: Record<string, string> = {
  zugang: "Wareneingang",
  entnahme: "Entnahme",
  korrektur: "Korrektur",
};

export default function VerwaltungHome() {
  const db = getDb();
  const now = new Date();
  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };

  const k = kennzahlen(db);
  const artikel = artikelListe(db);
  const journal = journalEintraege(db, 5);

  const kritischeArtikel = artikel
    .map((a) => {
      const unter = braucht(a.bestand, a.mindestbestand);
      const ablaufStatus = a.naechsteCharge ? verfallStatus(a.naechsteCharge.verfall, opts, now) : null;
      const ablauf = ablaufStatus && ablaufStatus.ampel !== "gruen" ? ablaufStatus : null;
      return { ...a, unter, ablauf };
    })
    .filter((a) => a.unter || a.ablauf);

  return (
    <>
      <div className="mainhead">
        <h1>Übersicht</h1>
        <span className="mono" style={{ color: "var(--stahl)" }}>
          {fmtTs(now)} Uhr
        </span>
      </div>
      <div className="kpis">
        <div className={`kpi ${k.unterMindest ? "rot" : "ok"}`}>
          <b>{k.unterMindest}</b>
          <div>Artikel unter Mindestbestand</div>
        </div>
        <div className={`kpi ${k.chargenKritisch ? "gelb" : "ok"}`}>
          <b>{k.chargenKritisch}</b>
          <div>Chargen bald fällig / abgelaufen</div>
        </div>
        <div className="kpi">
          <b>{k.offeneBestellungen}</b>
          <div>offene Bestellpositionen</div>
        </div>
        <div className="kpi">
          <b>{k.buchungenGesamt}</b>
          <div>Buchungen im Journal</div>
        </div>
      </div>
      <div className="card">
        <div className="cardtitle">Kritische Artikel</div>
        {kritischeArtikel.length === 0 && <div className="empty">Alles im grünen Bereich.</div>}
        {kritischeArtikel.map((a) => (
          <Link className="row" key={a.id} href="/verwaltung/artikel">
            <div className="rowmain">
              <div className="rowname">{a.name}</div>
              <div className="rowmeta">
                <span className="fach">{a.fach}</span>
                {!a.unter && !a.ablauf && <span className="chip chip-ok">ok</span>}
                {a.unter && (
                  <span className="chip chip-rot">
                    <AlertTriangle size={11} /> unter Mindestbestand
                  </span>
                )}
                {a.ablauf && a.naechsteCharge && (
                  <span className={`chip chip-${a.ablauf.ampel}`}>
                    Charge {chargeText(a.ablauf, a.naechsteCharge.verfall)}
                  </span>
                )}
              </div>
            </div>
            <div className="bignum" style={{ fontSize: 20 }}>
              {a.bestand}
              <small>/ min. {a.mindestbestand}</small>
            </div>
          </Link>
        ))}
      </div>
      <div className="card journal">
        <div className="cardtitle">Letzte Buchungen</div>
        {journal.length === 0 && <div className="empty">Noch keine Buchungen.</div>}
        {journal.map((j) => {
          const typLabel = TYP_LABEL[j.typ] ?? j.typ;
          return (
            <div className="row" key={j.id}>
              <span className="jts">{fmtTs(j.ts)}</span>
              <span style={{ flex: 1 }}>
                {j.artikelName} · {j.kommentar ? `${typLabel} · ${j.kommentar}` : typLabel}
              </span>
              <span className={`jdelta ${j.menge < 0 ? "minus" : "plus"}`}>
                {j.menge > 0 ? "+" : ""}
                {j.menge}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
