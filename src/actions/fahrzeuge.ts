"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { lagerorte, sollPositionen, newId } from "@/db/schema";
import { requireAdmin } from "@/actions/session";

const FahrzeugSchema = z.object({ name: z.string().trim().min(1), kennung: z.string().trim().optional() });

export async function createFahrzeug(input: z.input<typeof FahrzeugSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = FahrzeugSchema.parse(input);
  const id = newId();
  db.insert(lagerorte).values({ id, name: v.name, typ: "fahrzeug", kennung: v.kennung ?? null, aktiv: true }).run();
  revalidatePath("/verwaltung/fahrzeuge");
  return { id };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });
export async function setFahrzeugAktiv(input: z.input<typeof AktivSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = AktivSchema.parse(input);
  db.update(lagerorte).set({ aktiv: v.aktiv }).where(eq(lagerorte.id, v.id)).run();
  revalidatePath("/verwaltung/fahrzeuge");
}

const SollSchema = z.object({
  id: z.string().min(1).optional(),
  fahrzeugId: z.string().min(1),
  fachLabel: z.string().trim().min(1),
  artikelId: z.string().min(1),
  soll: z.coerce.number().int().positive(),
  sort: z.coerce.number().int().default(0),
});
export async function sollPositionSetzen(input: z.input<typeof SollSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = SollSchema.parse(input);
  const id = v.id ?? newId();
  if (v.id) {
    db.update(sollPositionen).set({ fahrzeugId: v.fahrzeugId, fachLabel: v.fachLabel, artikelId: v.artikelId, soll: v.soll, sort: v.sort }).where(eq(sollPositionen.id, v.id)).run();
  } else {
    db.insert(sollPositionen).values({ id, fahrzeugId: v.fahrzeugId, fachLabel: v.fachLabel, artikelId: v.artikelId, soll: v.soll, sort: v.sort }).run();
  }
  revalidatePath("/verwaltung/fahrzeuge");
  return { id };
}

const EntfernenSchema = z.object({ id: z.string().min(1) });
export async function sollPositionEntfernen(input: z.input<typeof EntfernenSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = EntfernenSchema.parse(input);
  db.delete(sollPositionen).where(eq(sollPositionen.id, v.id)).run();
  revalidatePath("/verwaltung/fahrzeuge");
}
