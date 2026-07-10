import { getDb } from "@/db";
import { artikelListe } from "@/db/queries";
import { braucht } from "@/lib/domain/vorschlag";
import { verfallStatus } from "@/lib/domain/verfall";
import { config } from "@/lib/config";
import { chargeText } from "@/lib/format";
import { ArtikelTable, type ArtikelRow } from "./ArtikelTable";

export const dynamic = "force-dynamic";

export default function ArtikelPage() {
  const db = getDb();
  const now = new Date();
  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };

  const rows: ArtikelRow[] = artikelListe(db).map((a) => {
    const naechsteStatus = a.naechsteCharge ? verfallStatus(a.naechsteCharge.verfall, opts, now) : null;
    return {
      ...a,
      unterMindest: braucht(a.bestand, a.mindestbestand),
      naechsteAmpel: naechsteStatus?.ampel ?? null,
      naechsteAblaufText:
        naechsteStatus && naechsteStatus.ampel !== "gruen" && a.naechsteCharge
          ? chargeText(naechsteStatus, a.naechsteCharge.verfall)
          : null,
    };
  });

  return <ArtikelTable rows={rows} />;
}
