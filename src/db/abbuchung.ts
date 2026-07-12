import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { fefoVerteilung } from "@/lib/domain/fefo";
import { bestandProCharge } from "@/lib/domain/bestand";

// tx-Typ der Drizzle-Transaktion (Callback-Parameter von db.transaction).
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type Quelle = { quelleTyp: "oidc" | "token"; quelleId: string };

// Transaktions-FREIER FEFO-Abbuchungskern: laeuft INNERHALB einer bestehenden tx.
// Verteilt `menge` FEFO ueber die Chargen des Artikels (Rest>0, aufsteigender Verfall),
// kappt am Bestand, je Charge eine entnahme-Buchung (optional mit referenz). Gibt die
// tatsaechlich gebuchte Menge zurueck. Geteilt von Entnahme-Wrappern UND checkAbschluss.
export function fefoAbbuchung(
  tx: Tx,
  args: { artikelId: string; menge: number; quelle: Quelle; kommentar: string | null; referenz: string | null; typ?: "entnahme" | "korrektur" },
): number {
  const { artikelId, menge, quelle, kommentar, referenz, typ = "entnahme" } = args;
  const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  const bu = tx.select().from(buchungen).where(eq(buchungen.artikelId, artikelId)).all();
  const rest = bestandProCharge(bu.map((b) => ({ chargeId: b.chargeId, menge: b.menge })));
  const chargenRest = chs.map((c) => ({ chargeId: c.id, verfall: c.verfall, rest: rest.get(c.id) ?? 0 }));
  let gebucht = 0;
  for (const teil of fefoVerteilung(chargenRest, menge)) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ, artikelId, chargeId: teil.chargeId,
      lagerortId: HANDLAGER_ID, menge: -teil.menge, quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
      referenz, kommentar,
    }).run();
    gebucht += teil.menge;
  }
  return gebucht;
}
