import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { geraetById } from "@/db/geraete";
import { lagerortOptionen } from "@/db/bz";
import { geraetFaelligChip } from "@/lib/format";
import { GeraetForm } from "../GeraetForm";
import { GeraetAktivToggle } from "./GeraetAktivToggle";
import { LoeschButton } from "@/components/LoeschButton";

export const dynamic = "force-dynamic";

export default async function GeraetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const detail = geraetById(db, id);
  if (!detail) notFound();
  const { geraet: g, lagerortName, faelligkeit } = detail;
  const optionen = lagerortOptionen(db);
  const fi = geraetFaelligChip(g.typ, faelligkeit);
  const kpiTone = fi ? (fi.tone === "grau" ? "" : fi.tone) : "ok";

  return (
    <>
      <Link className="backlink" href="/verwaltung/geraete"><ArrowLeft size={15} /> Geräte</Link>
      <div className="mainhead">
        <h1>
          {g.name}
          {g.barcode ? <span className="mono" style={{ marginLeft: 10, color: "var(--stahl)", fontSize: 15 }}>{g.barcode}</span> : null}
        </h1>
        <GeraetAktivToggle id={g.id} aktiv={g.aktiv} />
      </div>

      <div className="kpis">
        <div className="kpi"><b>{g.typ === "medizin" ? "Medizin" : "Objekt"}</b><div>Gerätetyp</div></div>
        <div className={`kpi ${kpiTone}`}><b>{fi ? fi.text : "–"}</b><div>{g.typ === "medizin" ? "MTK-Fälligkeit" : "Ablauf"}</div></div>
        <div className="kpi"><b style={{ fontSize: 16 }}>{lagerortName}</b><div>Standort</div></div>
        <div className={`kpi ${g.aktiv ? "ok" : "gelb"}`}><b>{g.aktiv ? "aktiv" : "inaktiv"}</b><div>Status</div></div>
      </div>

      <h2 className="secthead">Stammdaten</h2>
      <GeraetForm
        lagerorte={optionen}
        initial={{
          id: g.id,
          typ: g.typ,
          name: g.name,
          barcode: g.barcode,
          lagerortId: g.lagerortId,
          anmerkung: g.anmerkung,
          mtkFaellig: g.mtkFaellig,
          beschreibung: g.beschreibung,
          ablaufdatum: g.ablaufdatum,
        }}
      />

      <div className="gefahr">
        <div className="gtitle">Gefahrenzone</div>
        <p>
          Gerät endgültig löschen. Das ist nur möglich, solange es in keinem Check quittiert wurde —
          sonst biete ich stattdessen das Deaktivieren an.
        </p>
        <LoeschButton
          art="geraet"
          id={g.id}
          name={g.name}
          typLabel="Gerät"
          label="Gerät löschen"
          className="btn btn-ghost-rot slim"
          redirectTo="/verwaltung/geraete"
        />
      </div>
    </>
  );
}
