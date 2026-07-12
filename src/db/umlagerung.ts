import { buchungen, newId } from "@/db/schema";
import { fefoAbbuchung, type Tx, type Quelle, type Teil } from "@/db/abbuchung";

// Umlagerung: transportiert Bestand zwischen zwei Lagerorten unter Erhalt der chargeId
// (Verfall-Provenienz bleibt erhalten). FEFO-Abgang am Quell-Lagerort, gespiegelter Zugang je
// EXAKT derselben Charge/Teilmenge am Ziel-Lagerort. Netto beider Legs = 0 (keine
// Bestandsvernichtung/-verdopplung). Kappt an der Quell-Verfügbarkeit -> umgelagert <= menge.
// Beide Legs tragen typ="umlagerung" (NICHT zugang/entnahme), damit Reporting/Bestellvorschlag
// eine interne Verschiebung nicht als externen Wareneingang/Verbrauch missversteht.
export function umlagerung(
  tx: Tx,
  args: {
    artikelId: string;
    menge: number;
    vonLagerortId: string;
    nachLagerortId: string;
    quelle: Quelle;
    kommentar: string | null;
    referenz: string;
  },
): { umgelagert: number; teile: Teil[] } {
  const { artikelId, menge, vonLagerortId, nachLagerortId, quelle, kommentar, referenz } = args;
  const { gebucht, teile } = fefoAbbuchung(tx, {
    artikelId, menge, lagerortId: vonLagerortId, quelle, kommentar, referenz, typ: "umlagerung",
  });
  // Ziel-Leg STRIKT aus teile[] (tatsächlich gebucht/gekappt), nie aus `menge` — sonst Netto != 0.
  for (const teil of teile) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ: "umlagerung", artikelId, chargeId: teil.chargeId,
      lagerortId: nachLagerortId, menge: teil.menge, quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
      referenz, kommentar,
    }).run();
  }
  return { umgelagert: gebucht, teile };
}
