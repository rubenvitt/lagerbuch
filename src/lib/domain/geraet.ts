import type { Ampel } from "@/lib/domain/verfall";

/** Warnfenster (Tage vor Fälligkeit → gelb). */
export const MTK_WARN_TAGE = 30;
export const OBJEKT_ABLAUF_WARN_TAGE = 30;

export type DatumFaelligkeit = {
  faelligAm: Date | null; // geparste Fälligkeit; null wenn kein/ungültiges Datum
  tageBisFaellig: number | null; // Kalendertage bis zur Fälligkeit (heute = 0, gestern = −1)
  ampel: Ampel; // nur aussagekräftig, wenn keinDatum === false
  ueberfaellig: boolean;
  keinDatum: boolean; // kein oder ungültiges Datum gepflegt
};

/** Parst "YYYY-MM-DD" auf lokale Mitternacht. Leer/ungültig (auch 2026-02-31) → null. */
function parseTag(datum: string | null): Date | null {
  if (!datum) return null;
  const m = datum.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const dt = new Date(y, mo - 1, d);
  // Guard gegen überrollende Kalendertage (z. B. 2026-02-31 → 2026-03-03).
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/**
 * Fälligkeit aus einem tagesgenauen Datum: rot ab überfällig, gelb im Warnfenster (inkl. heute),
 * sonst grün. Kein/ungültiges Datum → keinDatum:true (neutral; die UI zeigt das grau, nicht rot,
 * damit frisch angelegte Geräte ohne gepflegtes Datum keinen Fehlalarm auslösen).
 */
export function datumFaelligkeit(datum: string | null, now: Date, warnTage: number): DatumFaelligkeit {
  const faelligAm = parseTag(datum);
  if (faelligAm === null) {
    return { faelligAm: null, tageBisFaellig: null, ampel: "gruen", ueberfaellig: false, keinDatum: true };
  }
  const startHeute = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tageBisFaellig = Math.round((faelligAm.getTime() - startHeute.getTime()) / 86_400_000);
  const ueberfaellig = tageBisFaellig < 0;
  let ampel: Ampel;
  if (ueberfaellig) ampel = "rot";
  else if (tageBisFaellig <= warnTage) ampel = "gelb";
  else ampel = "gruen";
  return { faelligAm, tageBisFaellig, ampel, ueberfaellig, keinDatum: false };
}

export const mtkFaelligkeit = (datum: string | null, now: Date): DatumFaelligkeit =>
  datumFaelligkeit(datum, now, MTK_WARN_TAGE);

export const objektAblauf = (datum: string | null, now: Date): DatumFaelligkeit =>
  datumFaelligkeit(datum, now, OBJEKT_ABLAUF_WARN_TAGE);

/** Wählt die für den Gerätetyp relevante Fälligkeit: medizin → MTK, objekt → Ablaufdatum. */
export function geraetFaelligkeit(
  g: { typ: "medizin" | "objekt"; mtkFaellig: string | null; ablaufdatum: string | null },
  now: Date,
): DatumFaelligkeit {
  return g.typ === "medizin" ? mtkFaelligkeit(g.mtkFaellig, now) : objektAblauf(g.ablaufdatum, now);
}
