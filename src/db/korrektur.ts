import { eq } from "drizzle-orm";
import { buchungen, chargen, newId } from "@/db/schema";
import { fefoAbbuchung, type Tx, type Quelle } from "@/db/abbuchung";
import { bestandProLagerort } from "@/lib/domain/bestand";

// Gleicht den recorded Bestand EINES Lagerorts auf den gezählten Ist ab (Fahrzeug-Check-Abgleich
// bzw. Inventur eines einzelnen Lagerorts). diff = ist - recorded.
//   diff < 0  -> FEFO-Korrektur über die Chargen DIESES Lagerorts (nur dessen Rest, nicht global).
//   diff > 0  -> +diff auf die jüngste existierende Charge des Artikels (analog inventur.ts),
//                sonst eine Dummy-Charge ("Korrektur"/2099-12).
//   diff == 0 -> No-Op.
// Danach gilt: bestandProLagerort(..., lagerortId) === ist.
export function korrekturAufLagerort(
  tx: Tx,
  args: { artikelId: string; lagerortId: string; istMenge: number; quelle: Quelle; kommentar: string | null; referenz: string },
): { diff: number; chargeId: string | null } {
  const { artikelId, lagerortId, istMenge, quelle, kommentar, referenz } = args;
  const bu = tx.select().from(buchungen).where(eq(buchungen.artikelId, artikelId)).all();
  const recorded = bestandProLagerort(bu.map((b) => ({ lagerortId: b.lagerortId, menge: b.menge })), lagerortId);
  const diff = istMenge - recorded;
  if (diff === 0) return { diff: 0, chargeId: null };
  if (diff < 0) {
    const { teile } = fefoAbbuchung(tx, { artikelId, menge: -diff, lagerortId, quelle, kommentar, referenz, typ: "korrektur" });
    return { diff, chargeId: teile[0]?.chargeId ?? null };
  }
  // diff > 0: jüngste existierende Charge des Artikels, sonst Dummy-Charge.
  const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  let chargeId: string;
  if (chs.length > 0) {
    chargeId = chs.slice().sort((a, b) => b.verfall.localeCompare(a.verfall) || (b.createdAt.getTime() - a.createdAt.getTime()))[0].id;
  } else {
    chargeId = newId();
    tx.insert(chargen).values({ id: chargeId, artikelId, chargenNr: "Korrektur", verfall: "2099-12", createdAt: new Date() }).run();
  }
  tx.insert(buchungen).values({
    id: newId(), ts: new Date(), typ: "korrektur", artikelId, chargeId,
    lagerortId, menge: diff, quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId, referenz, kommentar,
  }).run();
  return { diff, chargeId };
}
