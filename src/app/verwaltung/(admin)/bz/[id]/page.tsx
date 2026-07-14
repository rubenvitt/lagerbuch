import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BatteryCharging } from "lucide-react";
import { getDb } from "@/db";
import { bzGeraetDetail, lagerortOptionen } from "@/db/bz";
import { fmtTs, fmtVerfall, chipTone } from "@/lib/format";
import { GeraetAktivToggle } from "./GeraetAktivToggle";
import { ReferenzEditor } from "./ReferenzEditor";
import { KontrolleForm } from "./KontrolleForm";
import { LoeschButton } from "@/components/LoeschButton";

export const dynamic = "force-dynamic";

function faelligText(f: NonNullable<ReturnType<typeof bzGeraetDetail>>["faelligkeit"]): string {
  if (f.nieGeprueft) return "noch nie geprüft";
  if (f.ueberfaellig) return `überfällig seit ${Math.abs(f.tageBisFaellig ?? 0)} T`;
  if (f.tageBisFaellig === 0) return "heute fällig";
  return `in ${f.tageBisFaellig} Tagen`;
}

export default async function BzGeraetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const detail = bzGeraetDetail(db, id);
  if (!detail) notFound();
  const { geraet: g, lagerortName, faelligkeit, akku, logbuch } = detail;
  const optionen = lagerortOptionen(db);

  return (
    <>
      <Link className="backlink" href="/verwaltung/bz"><ArrowLeft size={15} /> BZ-Kontrolle</Link>
      <div className="mainhead">
        <h1>
          {g.name}
          {g.barcode ? <span className="mono" style={{ marginLeft: 10, color: "var(--stahl)", fontSize: 15 }}>{g.barcode}</span> : null}
        </h1>
        <GeraetAktivToggle id={g.id} aktiv={g.aktiv} />
      </div>

      <div className="kpis">
        <div className={`kpi ${faelligkeit.ampel === "rot" ? "rot" : faelligkeit.ampel === "gelb" ? "gelb" : "ok"}`}>
          <b>{faelligText(faelligkeit)}</b><div>Kontrolle {faelligkeit.faelligAm ? `(bis ${fmtTs(faelligkeit.faelligAm)})` : ""}</div>
        </div>
        <div className="kpi"><b>{logbuch[0] ? fmtTs(logbuch[0].ts) : "–"}</b><div>Letzte Kontrolle</div></div>
        <div className="kpi"><b>{akku.tageDurchschnitt !== null ? `${Math.round(akku.tageDurchschnitt)} T` : "–"}</b><div>Ø Akku ({akku.anzahlWechsel} Wechsel)</div></div>
        <div className={`kpi ${g.aktiv ? "ok" : "gelb"}`}><b>{g.aktiv ? "aktiv" : "inaktiv"}</b><div>Status · {lagerortName}</div></div>
      </div>

      <h2 className="secthead">Referenz &amp; Streifen-Lot</h2>
      <ReferenzEditor geraet={g} lagerorte={optionen} />

      <h2 className="secthead">Kontrolle erfassen</h2>
      <KontrolleForm
        geraetId={g.id}
        level1={{ label: g.level1Label, min: g.level1Min, max: g.level1Max }}
        level2={{ label: g.level2Label, min: g.level2Min, max: g.level2Max }}
      />

      <h2 className="secthead">Logbuch ({logbuch.length})</h2>
      {logbuch.length === 0 ? (
        <div className="card cardpad">Für dieses Gerät wurde noch keine Kontrolle erfasst.</div>
      ) : (
        <div className="card">
          {logbuch.map((k) => (
            <div className="row" key={k.id}>
              <div className="rowmain">
                <div className="rowname">{fmtTs(k.ts)}
                  <span className={`chip chip-${k.bestanden ? "ok" : "rot"}`} style={{ marginLeft: 8 }}>{k.bestanden ? "bestanden" : "nicht bestanden"}</span>
                </div>
                <div className="rowmeta">
                  {k.level1Wert !== null && (
                    <span className={`chip chip-${chipTone(k.level1ImBereich === false ? "rot" : k.level1ImBereich === true ? "gruen" : "gelb")}`}>
                      L1 {k.level1Wert}
                    </span>
                  )}
                  {k.level2Wert !== null && (
                    <span className={`chip chip-${chipTone(k.level2ImBereich === false ? "rot" : k.level2ImBereich === true ? "gruen" : "gelb")}`}>
                      L2 {k.level2Wert}
                    </span>
                  )}
                  {k.kompresseVerfall && <small>Kompresse {fmtVerfall(k.kompresseVerfall)}</small>}
                  {(k.sticks > 0 || k.lanzetten > 0) && <small>· {k.sticks} Sticks / {k.lanzetten} Lanzetten</small>}
                  {k.batterieGewechselt && <span className="chip chip-gelb"><BatteryCharging size={11} /> Akku gewechselt</span>}
                  <small>· {k.wer}</small>
                  {k.kommentar && <small>· {k.kommentar}</small>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="gefahr">
        <div className="gtitle">Gefahrenzone</div>
        <p>
          Gerät endgültig löschen. Das ist nur möglich, solange keine Kontrolle im Logbuch steht — sonst biete ich
          stattdessen das Deaktivieren an.
        </p>
        <LoeschButton
          art="bzGeraet"
          id={g.id}
          name={g.name}
          typLabel="BZ-Gerät"
          label="Gerät löschen"
          className="btn btn-ghost-rot slim"
          redirectTo="/verwaltung/bz"
        />
      </div>
    </>
  );
}
