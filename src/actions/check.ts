"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { checks, sollPositionen, geraete, newId } from "@/db/schema";
import { requireHelfer } from "@/actions/session";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { korrekturAufLagerort } from "@/db/korrektur";
import { umlagerung } from "@/db/umlagerung";

const CheckSchema = z.object({
  fahrzeugId: z.string().min(1),
  // Kann leer sein (Fahrzeug ohne Soll-Artikel, aber mit Geräten). Der Flow verhindert komplett
  // leere Checks; serverseitig ist ein leerer Positions-Check harmlos (bucht nichts).
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
    .default([]),
  // Geräte-Quittierung (standort-basiert): Anwesenheit + Zustand je Gerät am Fahrzeug.
  geraete: z
    .array(
      z.object({
        geraetId: z.string().min(1),
        vorhanden: z.boolean(),
        zustand: z.string().trim().optional(), // "In Ordnung" | "Gebrauchsspuren" | "Defekt" | frei
        bemerkung: z.string().trim().optional(),
      }),
    )
    .default([]),
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
  let geraeteAuffaellig = 0; // Geräte, die fehlen oder als "Defekt" quittiert wurden
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

    // Geräte am Fahrzeug (standort-basiert): nur eingereichte Geräte akzeptieren, die wirklich hier
    // stehen (Grabstein-analog gegen manipulierte Client-Eingaben). Zustand/Bemerkung als Snapshot.
    const geraeteHier = new Set(tx.select({ id: geraete.id }).from(geraete).where(eq(geraete.lagerortId, v.fahrzeugId)).all().map((g) => g.id));
    const geraeteErgebnis = v.geraete.map((e) => {
      if (!geraeteHier.has(e.geraetId)) throw new Error("Gerät gehört nicht zu diesem Fahrzeug");
      if (!e.vorhanden || e.zustand === "Defekt") geraeteAuffaellig++;
      return { geraetId: e.geraetId, vorhanden: e.vorhanden, zustand: e.zustand ?? null, bemerkung: e.bemerkung ?? null };
    });

    tx.insert(checks).values({
      id: checkId, fahrzeugId: v.fahrzeugId, quelleTyp: "token", quelleId: code,
      startedAt: new Date(), completedAt: new Date(),
      ergebnis: JSON.stringify({ positionen: posErgebnis, artikel: artikelErgebnis, geraete: geraeteErgebnis }),
    }).run();
  });
  revalidatePath("/helfer/check");
  revalidatePath("/verwaltung/checks");
  revalidatePath("/verwaltung");
  return { checkId, nachgefuellt, offen, geraeteAuffaellig };
}
