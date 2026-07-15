import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { geraete, lagerorte } from "@/db/schema";
import { geraetFaelligkeit, type DatumFaelligkeit } from "@/lib/domain/geraet";

export type GeraetTyp = "medizin" | "objekt";

export type GeraetZeile = {
  id: string;
  typ: GeraetTyp;
  name: string;
  barcode: string | null;
  lagerortId: string;
  lagerortName: string;
  anmerkung: string | null;
  mtkFaellig: string | null;
  beschreibung: string | null;
  ablaufdatum: string | null;
  aktiv: boolean;
  faelligkeit: DatumFaelligkeit;
};

function toZeile(g: typeof geraete.$inferSelect, lagerortName: string, now: Date): GeraetZeile {
  return {
    id: g.id,
    typ: g.typ,
    name: g.name,
    barcode: g.barcode,
    lagerortId: g.lagerortId,
    lagerortName,
    anmerkung: g.anmerkung,
    mtkFaellig: g.mtkFaellig,
    beschreibung: g.beschreibung,
    ablaufdatum: g.ablaufdatum,
    aktiv: g.aktiv,
    faelligkeit: geraetFaelligkeit(g, now),
  };
}

export function geraeteUebersicht(db: DB, now: Date = new Date()): GeraetZeile[] {
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  return db
    .select()
    .from(geraete)
    .all()
    .map((g) => toZeile(g, namen.get(g.lagerortId) ?? "–", now))
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.typ.localeCompare(b.typ) || a.name.localeCompare(b.name));
}

/** Aktive Geräte an einem Standort — für den Fahrzeugcheck & die Fahrzeug-Detailseite. */
export function geraeteFuerLagerort(db: DB, lagerortId: string, now: Date = new Date()): GeraetZeile[] {
  const name = db.select().from(lagerorte).where(eq(lagerorte.id, lagerortId)).get()?.name ?? "–";
  return db
    .select()
    .from(geraete)
    .where(eq(geraete.lagerortId, lagerortId))
    .all()
    .filter((g) => g.aktiv)
    .map((g) => toZeile(g, name, now))
    .sort((a, b) => a.typ.localeCompare(b.typ) || a.name.localeCompare(b.name));
}

export type GeraetDetail = {
  geraet: typeof geraete.$inferSelect;
  lagerortName: string;
  faelligkeit: DatumFaelligkeit;
};

export function geraetById(db: DB, id: string, now: Date = new Date()): GeraetDetail | null {
  const g = db.select().from(geraete).where(eq(geraete.id, id)).get();
  if (!g) return null;
  const lagerortName = db.select().from(lagerorte).where(eq(lagerorte.id, g.lagerortId)).get()?.name ?? "–";
  return { geraet: g, lagerortName, faelligkeit: geraetFaelligkeit(g, now) };
}

export function geraetByBarcode(db: DB, barcode: string): { id: string } | null {
  const g = db.select().from(geraete).where(eq(geraete.barcode, barcode)).get();
  return g ? { id: g.id } : null;
}
