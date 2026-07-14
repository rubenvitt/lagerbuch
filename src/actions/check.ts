"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { checks, sollPositionen, newId } from "@/db/schema";
import { requireHelfer } from "@/actions/session";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { korrekturAufLagerort } from "@/db/korrektur";
import { umlagerung } from "@/db/umlagerung";

const CheckSchema = z.object({
  fahrzeugId: z.string().min(1),
  positionen: z
    .array(
      z.object({
        sollPositionId: z.string().min(1),
        ist: z.coerce.number().int().min(0),
        // Vom Helfer im Nachfüll-Schritt bestätigte Menge. Serverseitig pro Position auf
        // max(0, Soll − Ist) geklemmt und über umlagerung() an der Handlager-Verfügbarkeit gekappt.
        nachfuellMenge: z.coerce.number().int().min(0),
      }),
    )
    .min(1),
});

// Fahrzeug-Check-Abschluss (§7 Regel 6, lagerort-echt): EINE Transaktion.
// WICHTIG: Der Fahrzeugbestand ist pro (Artikel, Lagerort) — NICHT pro Fach/Soll-Position. Liegt
// derselbe Artikel in mehreren Fächern, teilen sich diese Positionen EINEN Fahrzeug-Bestand.
// Deshalb wird pro ARTIKEL (nicht pro Position) genau einmal:
//   1. ABGLEICH — Fahrzeugbestand des Artikels auf die Summe der gezählten Ist gesetzt.
//   2. NACHFÜLLEN — die Summe der bestätigten Nachfüllmengen aus dem Handlager umgelagert.
export async function checkAbschluss(input: z.input<typeof CheckSchema>, db: DB = getDb()) {
  const { code } = await requireHelfer(db);
  const v = CheckSchema.parse(input);
  const checkId = newId();
  let nachgefuellt = 0; // tatsächlich (nach Handlager-Kappung) umgelagerte Gesamtmenge
  let offen = 0; // nach dem Check noch fehlend (Soll − gezählt − nachgefüllt), z. B. Handlager leer
  db.transaction((tx) => {
    // Grabsteine (entfernt) sind kein Soll → aus der gültigen Positionsmenge ausschließen.
    const sollRows = tx.select().from(sollPositionen).where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all().filter((s) => !s.entfernt);
    const byId = new Map(sollRows.map((s) => [s.id, s]));
    const quelle = { quelleTyp: "token" as const, quelleId: code };
    const referenz = `check:${checkId}`;

    // Positionen validieren, pro Position klemmen und nach artikelId aggregieren.
    type Gruppe = { artikelId: string; positionen: string[]; sollSumme: number; istSumme: number; nachfuellGewuenscht: number };
    const gruppen = new Map<string, Gruppe>();
    const posErgebnis: { sollPositionId: string; artikelId: string; soll: number; ist: number }[] = [];
    for (const p of v.positionen) {
      const row = byId.get(p.sollPositionId);
      if (!row) throw new Error("Soll-Position gehört nicht zu diesem Fahrzeug");
      const nachfuellWunsch = Math.min(p.nachfuellMenge, Math.max(0, row.soll - p.ist));
      const g = gruppen.get(row.artikelId) ?? { artikelId: row.artikelId, positionen: [], sollSumme: 0, istSumme: 0, nachfuellGewuenscht: 0 };
      g.positionen.push(row.id);
      g.sollSumme += row.soll;
      g.istSumme += p.ist;
      g.nachfuellGewuenscht += nachfuellWunsch;
      gruppen.set(row.artikelId, g);
      posErgebnis.push({ sollPositionId: row.id, artikelId: row.artikelId, soll: row.soll, ist: p.ist });
    }

    // Pro Artikel einmal abgleichen + nachfüllen.
    const artikelErgebnis = [...gruppen.values()].map((g) => {
      const { diff: korrektur } = korrekturAufLagerort(tx, {
        artikelId: g.artikelId, lagerortId: v.fahrzeugId, istMenge: g.istSumme,
        quelle, kommentar: "Fahrzeug-Check Abgleich", referenz,
      });
      const recordedVorher = g.istSumme - korrektur;
      const nachfuellGebucht =
        g.nachfuellGewuenscht > 0
          ? umlagerung(tx, {
              artikelId: g.artikelId, menge: g.nachfuellGewuenscht, vonLagerortId: HANDLAGER_ID,
              nachLagerortId: v.fahrzeugId, quelle, kommentar: "Fahrzeug-Check Nachfüllung", referenz,
            }).umgelagert
          : 0;
      nachgefuellt += nachfuellGebucht;
      offen += Math.max(0, g.sollSumme - g.istSumme - nachfuellGebucht);
      return { artikelId: g.artikelId, positionen: g.positionen, sollSumme: g.sollSumme, istSumme: g.istSumme, recordedVorher, korrektur, nachfuellGewuenscht: g.nachfuellGewuenscht, nachfuellGebucht };
    });

    tx.insert(checks).values({
      id: checkId, fahrzeugId: v.fahrzeugId, quelleTyp: "token", quelleId: code,
      startedAt: new Date(), completedAt: new Date(),
      ergebnis: JSON.stringify({ positionen: posErgebnis, artikel: artikelErgebnis }),
    }).run();
  });
  revalidatePath("/helfer/check");
  revalidatePath("/verwaltung/checks");
  revalidatePath("/verwaltung");
  return { checkId, nachgefuellt, offen };
}
