"use server";
import { getDb } from "@/db";
import { artikelDetail } from "@/db/queries";
import { requireAdmin } from "@/actions/session";
import { verfallStatus, type Ampel } from "@/lib/domain/verfall";
import { chargeText } from "@/lib/format";
import { config } from "@/lib/config";

export type ArtikelDetailCharge = {
  id: string;
  chargenNr: string;
  verfall: string;
  rest: number;
  ampel: Ampel;
  text: string;
};

export type ArtikelDetailBuchung = {
  ts: Date;
  typ: string;
  menge: number;
  kommentar: string | null;
  quelleId: string;
};

export type ArtikelDetailResult = {
  artikel: { id: string; name: string; einheit: string; fach: string; mindestbestand: number };
  bestand: number;
  chargen: ArtikelDetailCharge[];
  buchungen: ArtikelDetailBuchung[];
} | null;

export async function getDetail(id: string): Promise<ArtikelDetailResult> {
  await requireAdmin();
  const detail = artikelDetail(getDb(), id);
  if (!detail) return null;

  const now = new Date();
  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };

  const chargen = detail.chargen
    .filter((c) => c.rest > 0)
    .map((c) => {
      const status = verfallStatus(c.verfall, opts, now);
      return { ...c, ampel: status.ampel, text: chargeText(status, c.verfall) };
    })
    .sort((a, b) => a.verfall.localeCompare(b.verfall));

  return {
    artikel: {
      id: detail.artikel.id,
      name: detail.artikel.name,
      einheit: detail.artikel.einheit,
      fach: detail.artikel.fach,
      mindestbestand: detail.artikel.mindestbestand,
    },
    bestand: detail.bestand,
    chargen,
    buchungen: detail.buchungen,
  };
}
