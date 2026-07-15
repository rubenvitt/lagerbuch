import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { geraete, bzGeraete } from "@/db/schema";

/**
 * Der Barcode-Namensraum ist über generische Geräte (geraete) UND BZ-Geräte (bz_geraete) global
 * eindeutig, weil beide sich den /g/[code]-Scan-/Deep-Link-Namensraum teilen (der Deep-Link löst
 * „erst geraete, dann bz_geraete" auf — eine Doppelvergabe würde den zweiten Treffer verschatten).
 * `eigen` schließt den gerade bearbeiteten Datensatz von der Kollision aus (Update mit unverändertem
 * Barcode). Wirft mit freundlicher Meldung statt rohem UNIQUE-constraint-Fehler.
 */
export function pruefeBarcodeFrei(
  db: DB,
  barcode: string,
  eigen: { tabelle: "geraet" | "bzGeraet"; id: string } | null,
): void {
  const g = db.select({ id: geraete.id }).from(geraete).where(eq(geraete.barcode, barcode)).get();
  if (g && !(eigen?.tabelle === "geraet" && eigen.id === g.id)) {
    throw new Error(`Barcode „${barcode}“ ist bereits einem Gerät zugeordnet.`);
  }
  const bz = db.select({ id: bzGeraete.id }).from(bzGeraete).where(eq(bzGeraete.barcode, barcode)).get();
  if (bz && !(eigen?.tabelle === "bzGeraet" && eigen.id === bz.id)) {
    throw new Error(`Barcode „${barcode}“ ist bereits einem BZ-Gerät zugeordnet.`);
  }
}
