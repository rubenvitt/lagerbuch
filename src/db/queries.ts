import { desc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { artikel, buchungen, chargen } from "@/db/schema";
import { bestand, bestandProCharge } from "@/lib/domain/bestand";
import { verfallStatus } from "@/lib/domain/verfall";
import { braucht } from "@/lib/domain/vorschlag";
import { config } from "@/lib/config";

export type ChargeZeile = { id: string; chargenNr: string; verfall: string; rest: number };
export type ArtikelZeile = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  mindestbestand: number;
  bestand: number;
  naechsteCharge: { chargenNr: string; verfall: string } | null;
};

// helper: rest per charge for one article
function chargenMitRest(db: DB, artikelId: string): ChargeZeile[] {
  const chs = db.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, artikelId)).all();
  const rest = bestandProCharge(bu.map((b) => ({ chargeId: b.chargeId, menge: b.menge })));
  return chs.map((c) => ({ id: c.id, chargenNr: c.chargenNr, verfall: c.verfall, rest: rest.get(c.id) ?? 0 }));
}

export function artikelListe(db: DB): ArtikelZeile[] {
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  return arts.map((a) => {
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, a.id)).all();
    const chargenRest = chargenMitRest(db, a.id)
      .filter((c) => c.rest > 0)
      .sort((x, y) => x.verfall.localeCompare(y.verfall));
    const naechste = chargenRest[0] ?? null;
    return {
      id: a.id,
      name: a.name,
      einheit: a.einheit,
      fach: a.fach,
      mindestbestand: a.mindestbestand,
      bestand: bestand(bu.map((b) => ({ menge: b.menge }))),
      naechsteCharge: naechste ? { chargenNr: naechste.chargenNr, verfall: naechste.verfall } : null,
    };
  });
}

export function artikelDetail(db: DB, id: string) {
  const a = db.select().from(artikel).where(eq(artikel.id, id)).get();
  if (!a) return null;
  const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).orderBy(desc(buchungen.ts)).all();
  return {
    artikel: a,
    bestand: bestand(bu.map((b) => ({ menge: b.menge }))),
    chargen: chargenMitRest(db, id),
    buchungen: bu.slice(0, 8).map((b) => ({ ts: b.ts, typ: b.typ, menge: b.menge, kommentar: b.kommentar, quelleId: b.quelleId })),
  };
}

export function journalEintraege(db: DB, limit = 100) {
  const rows = db.select().from(buchungen).orderBy(desc(buchungen.ts)).limit(limit).all();
  const names = new Map(db.select().from(artikel).all().map((a) => [a.id, a.name]));
  return rows.map((b) => ({
    id: b.id,
    ts: b.ts,
    artikelName: names.get(b.artikelId) ?? "–",
    typ: b.typ,
    menge: b.menge,
    quelleId: b.quelleId,
    kommentar: b.kommentar,
  }));
}

export function kennzahlen(db: DB) {
  const now = new Date();
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  const allBu = db.select().from(buchungen).all();
  const restProCharge = bestandProCharge(allBu.map((x) => ({ chargeId: x.chargeId, menge: x.menge })));

  let unterMindest = 0,
    offeneBestellungen = 0;
  for (const a of arts) {
    const b = bestand(allBu.filter((x) => x.artikelId === a.id).map((x) => ({ menge: x.menge })));
    if (braucht(b, a.mindestbestand)) {
      unterMindest++;
      if (!a.bestelltAt) offeneBestellungen++;
    }
  }

  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };
  const chargenKritisch = db
    .select()
    .from(chargen)
    .all()
    .filter((c) => {
      if ((restProCharge.get(c.id) ?? 0) <= 0) return false; // depleted → not a risk
      return verfallStatus(c.verfall, opts, now).ampel !== "gruen";
    }).length;

  const buchungenGesamt = allBu.length;
  return { unterMindest, chargenKritisch, offeneBestellungen, buchungenGesamt };
}
