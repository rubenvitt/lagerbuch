"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { geraete, newId } from "@/db/schema";
import { requireAdmin } from "@/actions/session";
import { geraetByBarcode } from "@/db/geraete";
import { pruefeBarcodeFrei } from "@/db/barcode";

const TagRegex = /^\d{4}-\d{2}-\d{2}$/; // "YYYY-MM-DD"

const GeraetSchema = z.object({
  id: z.string().min(1).optional(), // gesetzt = update
  typ: z.enum(["medizin", "objekt"]),
  name: z.string().trim().min(1),
  barcode: z.string().trim().optional(),
  lagerortId: z.string().min(1),
  anmerkung: z.string().trim().optional(),
  mtkFaellig: z.string().regex(TagRegex).optional(), // nur medizin
  beschreibung: z.string().trim().optional(), // nur objekt
  ablaufdatum: z.string().regex(TagRegex).optional(), // nur objekt (optional)
});

const orNull = <T>(v: T | undefined): T | null => (v === undefined || v === "" ? null : v);

export async function geraetSpeichern(input: z.input<typeof GeraetSchema>, db: DB = getDb()): Promise<{ id: string }> {
  await requireAdmin();
  const v = GeraetSchema.parse(input);
  const barcode = orNull(v.barcode);
  if (barcode) pruefeBarcodeFrei(db, barcode, v.id ? { tabelle: "geraet", id: v.id } : null);
  const istMedizin = v.typ === "medizin";
  const felder = {
    typ: v.typ,
    name: v.name,
    barcode,
    lagerortId: v.lagerortId,
    anmerkung: orNull(v.anmerkung),
    // Typ-fremde Felder bewusst auf null halten — pro Typ ein sauberer Datensatz.
    mtkFaellig: istMedizin ? orNull(v.mtkFaellig) : null,
    beschreibung: istMedizin ? null : orNull(v.beschreibung),
    ablaufdatum: istMedizin ? null : orNull(v.ablaufdatum),
  };
  const id = v.id ?? newId();
  if (v.id) {
    db.update(geraete).set(felder).where(eq(geraete.id, v.id)).run();
  } else {
    db.insert(geraete).values({ id, aktiv: true, createdAt: new Date(), ...felder }).run();
  }
  revalidatePath("/verwaltung/geraete");
  revalidatePath(`/verwaltung/geraete/${id}`);
  return { id };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });
export async function setGeraetAktiv(input: z.input<typeof AktivSchema>, db: DB = getDb()): Promise<void> {
  await requireAdmin();
  const v = AktivSchema.parse(input);
  db.update(geraete).set({ aktiv: v.aktiv }).where(eq(geraete.id, v.id)).run();
  revalidatePath("/verwaltung/geraete");
  revalidatePath(`/verwaltung/geraete/${v.id}`);
}

/**
 * Sucht ein Gerät zum gescannten Code. Nimmt neben der rohen Seriennummer auch unsere
 * /g/[code]-Deep-Link-URLs an (gedrucktes QR-Etikett) und extrahiert daraus den Code.
 */
export async function geraetZuBarcode(rohwert: string, db: DB = getDb()): Promise<{ id: string } | null> {
  await requireAdmin();
  let code = rohwert.trim();
  const deepLink = code.match(/\/g\/([^/?#]+)/);
  if (deepLink) code = decodeURIComponent(deepLink[1]);
  if (!code) return null;
  return geraetByBarcode(db, code);
}
