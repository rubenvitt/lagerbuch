import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { fefoVerteilung } from "@/lib/domain/fefo";
import { bestandProLagerortUndCharge } from "@/lib/domain/bestand";

// tx-Typ der Drizzle-Transaktion (Callback-Parameter von db.transaction).
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type Quelle = { quelleTyp: "oidc" | "token" | "system"; quelleId: string };

export type Teil = { chargeId: string; menge: number };

// Transaktions-FREIER FEFO-Abbuchungskern: laeuft INNERHALB einer bestehenden tx.
// Verteilt `menge` FEFO ueber die Chargen des Artikels AN EINEM LAGERORT (Rest>0, aufsteigender
// Verfall), kappt am dortigen Bestand, je Charge eine Abgangs-Buchung (optional mit referenz).
// Gibt die tatsaechlich gebuchte Menge UND die Chargen-Aufteilung zurueck — letztere braucht
// umlagerung(), um denselben Bestand 1:1 (gleiche Charge) am Ziel-Lagerort gutzuschreiben.
//
// KRITISCH: Die Rest-Berechnung ist lagerort-gescoped (bestandProLagerortUndCharge). Ohne das
// wuerde nach der ersten Fahrzeug-Buchung derselben Charge der Fahrzeugbestand als Handlager-Rest
// mitgezaehlt -> Phantombestand / falsche FEFO-Verteilung.
export function fefoAbbuchung(
  tx: Tx,
  args: {
    artikelId: string;
    menge: number;
    lagerortId?: string;
    quelle: Quelle;
    kommentar: string | null;
    referenz: string | null;
    typ?: "entnahme" | "korrektur" | "umlagerung";
  },
): { gebucht: number; teile: Teil[] } {
  const { artikelId, menge, lagerortId = HANDLAGER_ID, quelle, kommentar, referenz, typ = "entnahme" } = args;
  const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  const bu = tx.select().from(buchungen).where(eq(buchungen.artikelId, artikelId)).all();
  const rest = bestandProLagerortUndCharge(
    bu.map((b) => ({ lagerortId: b.lagerortId, chargeId: b.chargeId, menge: b.menge })),
    lagerortId,
  );
  const chargenRest = chs.map((c) => ({ chargeId: c.id, verfall: c.verfall, rest: rest.get(c.id) ?? 0 }));
  const teile = fefoVerteilung(chargenRest, menge);
  let gebucht = 0;
  for (const teil of teile) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ, artikelId, chargeId: teil.chargeId,
      lagerortId, menge: -teil.menge, quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
      referenz, kommentar,
    }).run();
    gebucht += teil.menge;
  }
  return { gebucht, teile };
}
