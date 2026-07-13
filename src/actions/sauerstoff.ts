"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { o2Flaschen, o2Messungen, newId } from "@/db/schema";
import { requireAdmin } from "@/actions/session";

const FlascheSchema = z.object({
  id: z.string().min(1).optional(), // gesetzt = update
  name: z.string().trim().min(1),
  lagerortId: z.string().min(1),
  groesseLiter: z.coerce.number().int().positive().optional(),
  nennfuelldruckBar: z.coerce.number().int().positive().default(200),
});

export async function flascheSpeichern(input: z.input<typeof FlascheSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = FlascheSchema.parse(input);
  const id = v.id ?? newId();
  if (v.id) {
    db.update(o2Flaschen)
      .set({ name: v.name, lagerortId: v.lagerortId, groesseLiter: v.groesseLiter ?? null, nennfuelldruckBar: v.nennfuelldruckBar })
      .where(eq(o2Flaschen.id, v.id))
      .run();
    revalidatePath(`/verwaltung/sauerstoff/${v.id}`);
  } else {
    db.insert(o2Flaschen)
      .values({ id, name: v.name, lagerortId: v.lagerortId, groesseLiter: v.groesseLiter ?? null, nennfuelldruckBar: v.nennfuelldruckBar, aktiv: true, createdAt: new Date() })
      .run();
  }
  revalidatePath("/verwaltung/sauerstoff");
  return { id };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });
export async function setFlascheAktiv(input: z.input<typeof AktivSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = AktivSchema.parse(input);
  db.update(o2Flaschen).set({ aktiv: v.aktiv }).where(eq(o2Flaschen.id, v.id)).run();
  revalidatePath("/verwaltung/sauerstoff");
  revalidatePath(`/verwaltung/sauerstoff/${v.id}`);
}

const MessungSchema = z.object({
  flascheId: z.string().min(1),
  druckBar: z.coerce.number().int().min(0),
  kommentar: z.string().trim().optional(),
});

// Messungen sind unveränderlich: nur Insert (append-only), kein Update/Delete.
export async function messungErfassen(input: z.input<typeof MessungSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = MessungSchema.parse(input);
  const id = newId();
  db.insert(o2Messungen)
    .values({ id, flascheId: v.flascheId, ts: new Date(), druckBar: v.druckBar, quelleTyp: "oidc", quelleId: userId, kommentar: v.kommentar ?? null })
    .run();
  revalidatePath("/verwaltung/sauerstoff");
  revalidatePath(`/verwaltung/sauerstoff/${v.flascheId}`);
  return { id };
}
