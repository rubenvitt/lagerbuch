import { desc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { bzGeraete, bzKontrollen, lagerorte } from "@/db/schema";
import {
  akkuLebensdauer,
  bzFaelligkeit,
  type BzAkkuKennzahl,
  type BzFaelligkeit,
} from "@/lib/domain/bz";
import { quelleAufloeser } from "@/db/quelle";

export type BzKontrolleZeile = {
  id: string;
  ts: Date;
  wer: string;
  bestanden: boolean;
  level1Wert: number | null;
  level1ImBereich: boolean | null;
  level2Wert: number | null;
  level2ImBereich: boolean | null;
  kompresseVerfall: string | null;
  sticks: number;
  lanzetten: number;
  batterieGewechselt: boolean;
  kommentar: string | null;
};

export type BzGeraetZeile = {
  id: string;
  name: string;
  barcode: string | null;
  lagerortName: string;
  aktiv: boolean;
  letzteKontrolle: Date | null;
  letztesBestanden: boolean | null;
  faelligkeit: BzFaelligkeit;
};

export type BzGeraetDetail = {
  geraet: typeof bzGeraete.$inferSelect;
  lagerortName: string;
  faelligkeit: BzFaelligkeit;
  akku: BzAkkuKennzahl;
  logbuch: BzKontrolleZeile[]; // chronologisch absteigend
};

export type LagerortOption = { id: string; name: string; typ: "lager" | "fahrzeug" };

function toZeile(
  k: typeof bzKontrollen.$inferSelect,
  wer: (quelleTyp: string, quelleId: string) => string,
): BzKontrolleZeile {
  return {
    id: k.id,
    ts: k.ts,
    wer: wer(k.quelleTyp, k.quelleId), // aufgelöster Anzeigename (User/Token-Label)
    bestanden: k.bestanden,
    level1Wert: k.level1Wert,
    level1ImBereich: k.level1ImBereich,
    level2Wert: k.level2Wert,
    level2ImBereich: k.level2ImBereich,
    kompresseVerfall: k.kompresseVerfall,
    sticks: k.sticks,
    lanzetten: k.lanzetten,
    batterieGewechselt: k.batterieGewechselt,
    kommentar: k.kommentar,
  };
}

/** Aktive Lagerorte (Lager + Fahrzeug) als Auswahl für Geräte-Formulare. */
export function lagerortOptionen(db: DB): LagerortOption[] {
  return db
    .select()
    .from(lagerorte)
    .where(eq(lagerorte.aktiv, true))
    .all()
    .map((l) => ({ id: l.id, name: l.name, typ: l.typ }))
    .sort((a, b) => a.typ.localeCompare(b.typ) || a.name.localeCompare(b.name));
}

export function bzGeraeteUebersicht(db: DB, now: Date = new Date()): BzGeraetZeile[] {
  const geraete = db.select().from(bzGeraete).all();
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  const kontrollen = db.select().from(bzKontrollen).all();
  const letzteProGeraet = new Map<string, typeof kontrollen[number]>();
  for (const k of kontrollen) {
    const prev = letzteProGeraet.get(k.geraetId);
    if (!prev || k.ts > prev.ts) letzteProGeraet.set(k.geraetId, k);
  }
  return geraete
    .map((g) => {
      const letzte = letzteProGeraet.get(g.id) ?? null;
      return {
        id: g.id,
        name: g.name,
        barcode: g.barcode,
        lagerortName: namen.get(g.lagerortId) ?? "–",
        aktiv: g.aktiv,
        letzteKontrolle: letzte ? letzte.ts : null,
        letztesBestanden: letzte ? letzte.bestanden : null,
        faelligkeit: bzFaelligkeit(letzte ? letzte.ts : null, now),
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export function bzGeraetDetail(db: DB, id: string, now: Date = new Date()): BzGeraetDetail | null {
  const g = db.select().from(bzGeraete).where(eq(bzGeraete.id, id)).get();
  if (!g) return null;
  const lagerortName = db.select().from(lagerorte).where(eq(lagerorte.id, g.lagerortId)).get()?.name ?? "–";
  const ks = db.select().from(bzKontrollen).where(eq(bzKontrollen.geraetId, id)).orderBy(desc(bzKontrollen.ts)).all();
  const letzte = ks[0] ?? null;
  const faelligkeit = bzFaelligkeit(letzte ? letzte.ts : null, now);
  const akku = akkuLebensdauer(ks.filter((k) => k.batterieGewechselt).map((k) => k.ts));
  const wer = quelleAufloeser(db);
  return { geraet: g, lagerortName, faelligkeit, akku, logbuch: ks.map((k) => toZeile(k, wer)) };
}

export function bzGeraetByBarcode(db: DB, barcode: string): { id: string } | null {
  const g = db.select().from(bzGeraete).where(eq(bzGeraete.barcode, barcode)).get();
  return g ? { id: g.id } : null;
}

export function bzLogbuchGesamt(db: DB, limit = 100): (BzKontrolleZeile & { geraetName: string })[] {
  const namen = new Map(db.select().from(bzGeraete).all().map((g) => [g.id, g.name]));
  const wer = quelleAufloeser(db);
  return db
    .select()
    .from(bzKontrollen)
    .orderBy(desc(bzKontrollen.ts))
    .limit(limit)
    .all()
    .map((k) => ({ ...toZeile(k, wer), geraetName: namen.get(k.geraetId) ?? "–" }));
}

/** Ø Akku-Lebensdauer über ALLE Geräte: nur geräteinterne Wechsel-Intervalle, dann gemittelt. */
export function bzAkkuKennzahlGesamt(db: DB): BzAkkuKennzahl {
  const ks = db.select().from(bzKontrollen).where(eq(bzKontrollen.batterieGewechselt, true)).all();
  const proGeraet = new Map<string, Date[]>();
  for (const k of ks) {
    const arr = proGeraet.get(k.geraetId) ?? [];
    arr.push(k.ts);
    proGeraet.set(k.geraetId, arr);
  }
  let summe = 0;
  let anzahlIntervalle = 0;
  let anzahlWechsel = 0;
  for (const ts of proGeraet.values()) {
    const sorted = ts.slice().sort((a, b) => a.getTime() - b.getTime());
    anzahlWechsel += sorted.length;
    for (let i = 1; i < sorted.length; i++) {
      summe += (sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000;
      anzahlIntervalle++;
    }
  }
  return {
    tageDurchschnitt: anzahlIntervalle < 1 ? null : summe / anzahlIntervalle,
    anzahlWechsel,
    anzahlIntervalle,
  };
}
