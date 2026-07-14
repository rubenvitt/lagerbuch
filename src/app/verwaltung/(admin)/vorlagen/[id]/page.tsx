import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getDb } from "@/db";
import { templateDetail, artikelListe } from "@/db/queries";
import { TemplatePosEditor } from "./TemplatePosEditor";
import { TemplateAktionen } from "./TemplateAktionen";

export const dynamic = "force-dynamic";

export default async function VorlageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const vorlage = templateDetail(db, id);
  if (!vorlage) notFound();

  const artikel = artikelListe(db).map((a) => ({ id: a.id, name: a.name, fach: a.fach, einheit: a.einheit }));
  const faecher = new Set(vorlage.positionen.map((p) => p.fachLabel)).size;

  return (
    <>
      <Link className="backlink" href="/verwaltung/vorlagen"><ArrowLeft size={15} /> Vorlagen</Link>
      <div className="mainhead" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <h1>
          {vorlage.name}
          {!vorlage.aktiv && <span className="chip chip-grau" style={{ marginLeft: 10 }}>inaktiv</span>}
        </h1>
        <TemplateAktionen id={vorlage.id} name={vorlage.name} aktiv={vorlage.aktiv} fahrzeuge={vorlage.fahrzeuge.length} />
      </div>

      <div className="kpis">
        <div className="kpi"><b>{vorlage.positionen.length}</b><div>Positionen</div></div>
        <div className="kpi"><b>{faecher}</b><div>Fächer</div></div>
        <div className="kpi"><b>{vorlage.fahrzeuge.length}</b><div>Fahrzeuge</div></div>
      </div>

      <div className="cardtitle" style={{ padding: "6px 2px 8px" }}>Bestückung der Vorlage</div>
      <TemplatePosEditor templateId={vorlage.id} positionen={vorlage.positionen} artikel={artikel} />

      <div className="cardtitle" style={{ padding: "18px 2px 8px" }}>Verknüpfte Fahrzeuge</div>
      {vorlage.fahrzeuge.length === 0 ? (
        <div className="card cardpad">Noch keinem Fahrzeug zugewiesen. Zuweisen auf der jeweiligen Fahrzeug-Seite unter „Vorlage“.</div>
      ) : (
        <div className="card">
          {vorlage.fahrzeuge.map((f) => (
            <Link className="row" key={f.id} href={`/verwaltung/fahrzeuge/${f.id}`}>
              <div className="rowmain">
                <div className="rowname">
                  {f.name}
                  {f.kennung ? <span className="mono" style={{ marginLeft: 8, color: "var(--stahl)" }}>{f.kennung}</span> : null}
                  {!f.aktiv && <span className="chip chip-grau" style={{ marginLeft: 8 }}>inaktiv</span>}
                </div>
              </div>
              <ChevronRight size={18} style={{ color: "var(--stahl)", flex: "none" }} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
