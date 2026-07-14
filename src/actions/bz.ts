"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { bzGeraete, bzKontrollen, newId } from "@/db/schema";
import { requireAdmin } from "@/actions/session";
import { bewerteKontrolle } from "@/lib/domain/bz";
import { bzGeraetByBarcode } from "@/db/bz";

const GeraetSchema = z.object({
  id: z.string().min(1).optional(), // gesetzt = update
  name: z.string().trim().min(1),
  barcode: z.string().trim().optional(),
  lagerortId: z.string().min(1),
  streifenLot: z.string().trim().optional(),
  level1Label: z.string().trim().optional(),
  level1Min: z.coerce.number().int().optional(),
  level1Max: z.coerce.number().int().optional(),
  level2Label: z.string().trim().optional(),
  level2Min: z.coerce.number().int().optional(),
  level2Max: z.coerce.number().int().optional(),
});

const orNull = <T>(v: T | undefined): T | null => (v === undefined || v === "" ? null : v);

export async function geraetSpeichern(input: z.input<typeof GeraetSchema>, db: DB = getDb()): Promise<{ id: string }> {
  await requireAdmin();
  const v = GeraetSchema.parse(input);
  const felder = {
    name: v.name,
    barcode: orNull(v.barcode),
    lagerortId: v.lagerortId,
    streifenLot: orNull(v.streifenLot),
    level1Label: orNull(v.level1Label),
    level1Min: orNull(v.level1Min),
    level1Max: orNull(v.level1Max),
    level2Label: orNull(v.level2Label),
    level2Min: orNull(v.level2Min),
    level2Max: orNull(v.level2Max),
  };
  const id = v.id ?? newId();
  if (v.id) {
    db.update(bzGeraete).set(felder).where(eq(bzGeraete.id, v.id)).run();
  } else {
    db.insert(bzGeraete).values({ id, aktiv: true, createdAt: new Date(), ...felder }).run();
  }
  revalidatePath("/verwaltung/bz");
  revalidatePath(`/verwaltung/bz/${id}`);
  return { id };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });
export async function setGeraetAktiv(input: z.input<typeof AktivSchema>, db: DB = getDb()): Promise<void> {
  await requireAdmin();
  const v = AktivSchema.parse(input);
  db.update(bzGeraete).set({ aktiv: v.aktiv }).where(eq(bzGeraete.id, v.id)).run();
  revalidatePath("/verwaltung/bz");
  revalidatePath(`/verwaltung/bz/${v.id}`);
}

/**
 * Sucht ein Gerät zum gescannten Code. Nimmt neben der rohen Seriennummer auch
 * unsere /g/[code]-Deep-Link-URLs an (falls jemand ein gedrucktes QR-Etikett scannt)
 * und extrahiert daraus den Code.
 */
export async function geraetZuBarcode(rohwert: string, db: DB = getDb()): Promise<{ id: string } | null> {
  await requireAdmin();
  let code = rohwert.trim();
  const deepLink = code.match(/\/g\/([^/?#]+)/);
  if (deepLink) code = decodeURIComponent(deepLink[1]);
  if (!code) return null;
  return bzGeraetByBarcode(db, code);
}

const KontrolleSchema = z.object({
  geraetId: z.string().min(1),
  level1Wert: z.coerce.number().int().optional(),
  level2Wert: z.coerce.number().int().optional(),
  kompresseVerfall: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  sticks: z.coerce.number().int().min(0).default(0),
  lanzetten: z.coerce.number().int().min(0).default(0),
  batterieGewechselt: z.coerce.boolean().default(false),
  kommentar: z.string().trim().optional(),
});

/**
 * Erfasst eine unveränderliche Kontroll-Zeile (append-only, nur Insert).
 * Bewertet die gemessenen Werte gegen die am Gerät konfigurierten Referenzbereiche und friert
 * den Referenzstand als refSnapshot ein.
 */
export async function kontrolleErfassen(
  input: z.input<typeof KontrolleSchema>,
  db: DB = getDb(),
): Promise<{ id: string; bestanden: boolean }> {
  const { userId } = await requireAdmin();
  const v = KontrolleSchema.parse(input);
  const g = db.select().from(bzGeraete).where(eq(bzGeraete.id, v.geraetId)).get();
  if (!g) throw new Error("Gerät nicht gefunden");

  const level1Wert = v.level1Wert ?? null;
  const level2Wert = v.level2Wert ?? null;
  const { level1ImBereich, level2ImBereich, bestanden } = bewerteKontrolle({
    level1Wert,
    level1Min: g.level1Min,
    level1Max: g.level1Max,
    level2Wert,
    level2Min: g.level2Min,
    level2Max: g.level2Max,
  });

  const refSnapshot = JSON.stringify({
    streifenLot: g.streifenLot,
    level1Label: g.level1Label,
    level1Min: g.level1Min,
    level1Max: g.level1Max,
    level2Label: g.level2Label,
    level2Min: g.level2Min,
    level2Max: g.level2Max,
  });

  const id = newId();
  db.insert(bzKontrollen)
    .values({
      id,
      geraetId: g.id,
      ts: new Date(),
      quelleTyp: "oidc",
      quelleId: userId,
      level1Wert,
      level1ImBereich,
      level2Wert,
      level2ImBereich,
      kompresseVerfall: v.kompresseVerfall ?? null,
      sticks: v.sticks,
      lanzetten: v.lanzetten,
      batterieGewechselt: v.batterieGewechselt,
      kommentar: v.kommentar ?? null,
      bestanden,
      refSnapshot,
    })
    .run();

  revalidatePath("/verwaltung/bz");
  revalidatePath(`/verwaltung/bz/${g.id}`);
  return { id, bestanden };
}
