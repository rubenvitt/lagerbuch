import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getDb } from "@/db";
import { fahrzeugListe, sollFuerFahrzeug, artikelListe, checkHistorie, templateListeAktiv, templateDetail } from "@/db/queries";
import { geraeteFuerLagerort } from "@/db/geraete";
import { fmtTs, geraetFaelligChip } from "@/lib/format";
import { SollEditor } from "../SollEditor";
import { FahrzeugAktivToggle } from "./FahrzeugAktivToggle";
import { LoeschButton } from "@/components/LoeschButton";
import { TemplateVerknuepfung } from "./TemplateVerknuepfung";

export const dynamic = "force-dynamic";

export default async function FahrzeugDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const fahrzeug = fahrzeugListe(db).find((f) => f.id === id);
  if (!fahrzeug) notFound();

  const positionen = sollFuerFahrzeug(db, id);
  const aktivePositionen = positionen.filter((p) => !p.entfernt); // Grabsteine zählen nicht als Soll
  const artikel = artikelListe(db).map((a) => ({ id: a.id, name: a.name, fach: a.fach, einheit: a.einheit }));
  const faecher = new Set(aktivePositionen.map((p) => p.fachLabel)).size;
  const unterSoll = aktivePositionen.filter((p) => p.fahrzeugBestand < p.soll).length;
  const checks = checkHistorie(db).filter((c) => c.fahrzeugId === id).slice(0, 8);
  const geraete = geraeteFuerLagerort(db, id);
  // Verknüpfte Vorlage sperrt sich selbst aus der Auswahlliste aus (kein „auf sich selbst" zuweisen).
  const templates = templateListeAktiv(db).filter((t) => t.id !== fahrzeug.templateId);
  const templateName = fahrzeug.templateId ? (templateDetail(db, fahrzeug.templateId)?.name ?? null) : null;

  return (
    <>
      <Link className="backlink" href="/verwaltung/fahrzeuge"><ArrowLeft size={15} /> Fahrzeuge</Link>
      <div className="mainhead">
        <h1>
          {fahrzeug.name}
          {fahrzeug.kennung ? <span className="mono" style={{ marginLeft: 10, color: "var(--stahl)", fontSize: 15 }}>{fahrzeug.kennung}</span> : null}
        </h1>
        <FahrzeugAktivToggle id={fahrzeug.id} aktiv={fahrzeug.aktiv} />
      </div>

      <div className="kpis">
        <div className="kpi"><b>{aktivePositionen.length}</b><div>Soll-Positionen</div></div>
        <div className="kpi"><b>{faecher}</b><div>Fächer</div></div>
        <div className={`kpi ${unterSoll ? "rot" : "ok"}`}><b>{unterSoll}</b><div>Positionen unter Soll</div></div>
        <div className={`kpi ${fahrzeug.aktiv ? "ok" : "gelb"}`}><b>{fahrzeug.aktiv ? "aktiv" : "inaktiv"}</b><div>Status</div></div>
      </div>

      <h2 className="secthead">Vorlage</h2>
      <TemplateVerknuepfung fahrzeugId={fahrzeug.id} templateId={fahrzeug.templateId} templateName={templateName} templates={templates} hatPositionen={aktivePositionen.length > 0} />

      <h2 className="secthead">Soll-Bestückung</h2>
      <SollEditor fahrzeugId={fahrzeug.id} positionen={positionen} artikel={artikel} hatTemplate={Boolean(fahrzeug.templateId)} />

      <h2 className="secthead">Geräte an diesem Fahrzeug</h2>
      {geraete.length === 0 ? (
        <div className="card cardpad">
          Keine Geräte hinterlegt. Unter <Link href="/verwaltung/geraete">Geräte</Link> anlegen und als Standort dieses Fahrzeug wählen.
        </div>
      ) : (
        <div className="card">
          {geraete.map((g) => {
            const fi = geraetFaelligChip(g.typ, g.faelligkeit);
            return (
              <Link className="row" key={g.id} href={`/verwaltung/geraete/${g.id}`}>
                <div className="rowmain">
                  <div className="rowname">{g.name}</div>
                  <div className="rowmeta">
                    <span className="chip chip-grau">{g.typ === "medizin" ? "Medizin" : "Objekt"}</span>
                    {fi && <span className={`chip chip-${fi.tone}`}>{fi.text}</span>}
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: "var(--stahl)", flex: "none" }} />
              </Link>
            );
          })}
        </div>
      )}

      <h2 className="secthead">Letzte Checks</h2>
      {checks.length === 0 ? (
        <div className="card cardpad">Für dieses Fahrzeug wurde noch kein Check durchgeführt.</div>
      ) : (
        <div className="card">
          {checks.map((c) => (
            <Link className="row" key={c.id} href={`/verwaltung/checks/${c.id}`}>
              <div className="rowmain">
                <div className="rowname">{c.completedAt ? fmtTs(c.completedAt) : "–"}</div>
                <div className="rowmeta">
                  {c.nachgefuelltGesamt > 0 && <span className="chip chip-rot">{c.nachgefuelltGesamt} nachgefüllt</span>}
                  {c.korrigiertGesamt > 0 && <span className="chip chip-gelb">{c.korrigiertGesamt} korrigiert</span>}
                  {c.offenGesamt > 0 && <span className="chip chip-rot">{c.offenGesamt} fehlt</span>}
                  {c.geraeteAuffaellig > 0 && <span className="chip chip-rot">{c.geraeteAuffaellig} Gerät(e) auffällig</span>}
                  {c.nachgefuelltGesamt === 0 && c.korrigiertGesamt === 0 && c.offenGesamt === 0 && c.geraeteAuffaellig === 0 && <span className="chip chip-ok">vollständig</span>}
                  <small>{c.positionen} Positionen</small>
                </div>
              </div>
              <ChevronRight size={18} style={{ color: "var(--stahl)", flex: "none" }} />
            </Link>
          ))}
        </div>
      )}

      <div className="gefahr">
        <div className="gtitle">Gefahrenzone</div>
        <p>
          Fahrzeug endgültig löschen. Das ist nur möglich, wenn keine Buchungen, Soll-Positionen, Checks, Geräte oder
          Codes mehr daran hängen — sonst biete ich stattdessen das Deaktivieren an.
        </p>
        <LoeschButton
          art="fahrzeug"
          id={fahrzeug.id}
          name={fahrzeug.name}
          typLabel="Fahrzeug"
          label="Fahrzeug löschen"
          className="btn btn-ghost-rot slim"
          redirectTo="/verwaltung/fahrzeuge"
        />
      </div>
    </>
  );
}
