import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, Check } from "lucide-react";
import { getDb } from "@/db";
import { checkDetail } from "@/db/queries";
import { fmtTs } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = checkDetail(getDb(), id);
  if (!check) notFound();

  const faecher = [...new Set(check.positionen.map((p) => p.fachLabel))];

  return (
    <>
      <Link className="backlink" href="/verwaltung/checks"><ArrowLeft size={15} /> Checks</Link>
      <div className="mainhead">
        <h1>
          {check.fahrzeugName}
          {check.fahrzeugKennung ? <span className="mono" style={{ marginLeft: 10, color: "var(--stahl)", fontSize: 15 }}>{check.fahrzeugKennung}</span> : null}
        </h1>
        <span className="mono" style={{ color: "var(--stahl)" }}>
          {check.completedAt ? `${fmtTs(check.completedAt)} Uhr` : "nicht abgeschlossen"}
        </span>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{check.summe.positionen}</b><div>geprüfte Positionen</div></div>
        <div className={`kpi ${check.summe.nachgefuellt ? "rot" : "ok"}`}><b>{check.summe.nachgefuellt}</b><div>aus Handlager nachgefüllt</div></div>
        <div className={`kpi ${check.summe.korrigiert ? "gelb" : "ok"}`}><b>{check.summe.korrigiert}</b><div>Bestand korrigiert</div></div>
        <div className={`kpi ${check.summe.offen ? "rot" : "ok"}`}><b>{check.summe.offen}</b><div>fehlt weiterhin</div></div>
      </div>

      {check.summe.offen > 0 && (
        <div className="card cardpad" style={{ marginBottom: 12, borderLeft: "4px solid var(--rot)" }}>
          <div className="rowname" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <AlertTriangle size={16} style={{ color: "var(--rot)" }} /> {check.summe.offen} Teile fehlen weiterhin auf dem Fahrzeug
          </div>
          <small style={{ color: "var(--stahl)" }}>Nicht (vollständig) aufgefüllt – das Handlager hatte nicht genug oder es wurde nichts nachgelegt.</small>
        </div>
      )}

      {check.altFormat && (
        <div className="card cardpad" style={{ marginBottom: 12 }}>
          <div className="chip chip-grau" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <AlertTriangle size={13} /> Älteres Check-Format – Positionsdetails liegen für diesen Check nicht vor.
          </div>
        </div>
      )}

      {check.positionen.length > 0 && (
        <>
          <h2 className="secthead">Gezählt je Position</h2>
          {faecher.map((fach) => (
            <div key={fach}>
              <div className="fachhead">{fach}</div>
              <div className="card">
                {check.positionen.filter((p) => p.fachLabel === fach).map((p, i) => {
                  const luecke = Math.max(0, p.soll - p.ist);
                  const ueber = p.ist > p.soll;
                  return (
                    <div className="row" key={`${p.artikelId}-${i}`}>
                      <div className={`checkcircle ${luecke > 0 ? "fehl" : "done"}`}>{luecke > 0 ? <AlertTriangle size={14} /> : <Check size={16} />}</div>
                      <div className="rowmain">
                        <div className="rowname">{p.artikelName}</div>
                        <div className="rowmeta">
                          <small>Soll {p.soll} {p.einheit}</small>
                          {luecke > 0 && <span className="chip chip-rot">Lücke {luecke}</span>}
                          {ueber && <span className="chip chip-gelb">Überbestand {p.ist - p.soll}</span>}
                        </div>
                      </div>
                      <div className="bignum" style={{ fontSize: 20 }}>{p.ist}<small>gezählt</small></div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {check.artikel.length > 0 && (
        <>
          <h2 className="secthead">Abgleich je Artikel</h2>
          <div className="card">
            {check.artikel.map((a) => (
              <div className="row" key={a.artikelId}>
                <div className="rowmain">
                  <div className="rowname">{a.artikelName}</div>
                  <div className="rowmeta">
                    <small>vorher {a.recordedVorher} · gezählt {a.istSumme} · Soll {a.sollSumme} {a.einheit}</small>
                    {a.korrektur !== 0 && (
                      <span className="chip chip-gelb">Bestand {a.korrektur > 0 ? "+" : ""}{a.korrektur}</span>
                    )}
                    {a.nachfuellGebucht > 0 && <span className="chip chip-rot">nachgefüllt {a.nachfuellGebucht}</span>}
                    {a.offen > 0 && <span className="chip chip-rot"><AlertTriangle size={11} /> fehlt {a.offen}</span>}
                    {a.korrektur === 0 && a.nachfuellGebucht === 0 && a.offen === 0 && <span className="chip chip-ok">vollständig</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {check.geraete.length > 0 && (
        <>
          <h2 className="secthead">Geräte {check.summe.geraeteAuffaellig > 0 && <span className="chip chip-rot" style={{ marginLeft: 6 }}>{check.summe.geraeteAuffaellig} auffällig</span>}</h2>
          <div className="card">
            {check.geraete.map((g) => (
              <div className="row" key={g.geraetId}>
                <div className={`checkcircle ${g.vorhanden && g.zustand !== "Defekt" ? "done" : "fehl"}`}>
                  {g.vorhanden && g.zustand !== "Defekt" ? <Check size={16} /> : <AlertTriangle size={14} />}
                </div>
                <div className="rowmain">
                  <div className="rowname">{g.name}</div>
                  <div className="rowmeta" style={{ flexWrap: "wrap" }}>
                    {g.vorhanden ? (
                      <span className={`chip chip-${g.zustand === "Defekt" ? "rot" : g.zustand === "Gebrauchsspuren" ? "gelb" : "ok"}`}>
                        {g.zustand ?? "vorhanden"}
                      </span>
                    ) : (
                      <span className="chip chip-rot"><AlertTriangle size={11} /> fehlt</span>
                    )}
                    {g.bemerkung && <small>· {g.bemerkung}</small>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
