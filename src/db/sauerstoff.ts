import { desc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { o2Flaschen, o2Messungen, lagerorte } from "@/db/schema";
import { o2Status, type O2Status } from "@/lib/domain/o2";
import { quelleAufloeser } from "@/db/quelle";

export type O2FlascheZeile = {
  id: string;
  name: string;
  lagerortName: string;
  aktiv: boolean;
  groesseLiter: number | null;
  nennfuelldruckBar: number;
  letzterDruck: number | null;
  letzteMessung: Date | null;
  status: O2Status | null;
};
export type O2MessungZeile = { id: string; ts: Date; druckBar: number; wer: string; kommentar: string | null };
export type O2FlascheDetail = {
  flasche: typeof o2Flaschen.$inferSelect;
  lagerortName: string;
  status: O2Status | null;
  verlauf: O2MessungZeile[]; // chronologisch absteigend
};

/** Übersicht: letzter Druck (jüngste Messung) + Füllstand-% + Ampel je Flasche. */
export function o2FlaschenUebersicht(db: DB): O2FlascheZeile[] {
  const flaschen = db.select().from(o2Flaschen).all();
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  const messungen = db.select().from(o2Messungen).all();
  // Jüngste Messung je Flasche (aktueller Druck = letzte Messung; kein denormalisiertes Feld).
  const letzteProFlasche = new Map<string, { ts: Date; druckBar: number }>();
  for (const m of messungen) {
    const prev = letzteProFlasche.get(m.flascheId);
    if (!prev || m.ts > prev.ts) letzteProFlasche.set(m.flascheId, { ts: m.ts, druckBar: m.druckBar });
  }
  return flaschen
    .map((f) => {
      const letzte = letzteProFlasche.get(f.id) ?? null;
      const letzterDruck = letzte ? letzte.druckBar : null;
      return {
        id: f.id,
        name: f.name,
        lagerortName: namen.get(f.lagerortId) ?? "–",
        aktiv: f.aktiv,
        groesseLiter: f.groesseLiter,
        nennfuelldruckBar: f.nennfuelldruckBar,
        letzterDruck,
        letzteMessung: letzte ? letzte.ts : null,
        // Guard: Flaschen ohne Messung → status null (o2Status NICHT aufrufen).
        status: letzterDruck !== null ? o2Status(letzterDruck, f.nennfuelldruckBar) : null,
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export function o2FlascheDetail(db: DB, id: string): O2FlascheDetail | null {
  const f = db.select().from(o2Flaschen).where(eq(o2Flaschen.id, id)).get();
  if (!f) return null;
  const lo = db.select().from(lagerorte).where(eq(lagerorte.id, f.lagerortId)).get();
  const rows = db.select().from(o2Messungen).where(eq(o2Messungen.flascheId, id)).orderBy(desc(o2Messungen.ts)).all();
  const wer = quelleAufloeser(db);
  const verlauf: O2MessungZeile[] = rows.map((m) => ({
    id: m.id,
    ts: m.ts,
    druckBar: m.druckBar,
    wer: wer(m.quelleTyp, m.quelleId),
    kommentar: m.kommentar,
  }));
  const letzterDruck = verlauf.length > 0 ? verlauf[0].druckBar : null;
  return {
    flasche: f,
    lagerortName: lo?.name ?? "–",
    status: letzterDruck !== null ? o2Status(letzterDruck, f.nennfuelldruckBar) : null,
    verlauf,
  };
}

/** Aktive Lagerorte für das Flaschen-Anlegen-Dropdown. */
export function lagerorteFuerFlaschen(db: DB): { id: string; name: string }[] {
  return db
    .select()
    .from(lagerorte)
    .where(eq(lagerorte.aktiv, true))
    .all()
    .map((l) => ({ id: l.id, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
