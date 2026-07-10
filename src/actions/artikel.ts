"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "@/db";
import { artikel, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/actions/session";

const CreateSchema = z.object({
  name: z.string().trim().min(1),
  einheit: z.string().trim().min(1),
  fach: z.string().trim().min(1),
  mindestbestand: z.coerce.number().int().min(0),
});

export async function createArtikel(input: z.input<typeof CreateSchema>, db: DB = getDb()) {
  await requireAdmin();
  const data = CreateSchema.parse(input);
  const id = newId();
  db.insert(artikel).values({ id, ...data, aktiv: true, createdAt: new Date() }).run();
  revalidatePath("/verwaltung/artikel");
  return { id };
}

const UpdateSchema = CreateSchema.partial();

export async function updateArtikel(id: string, input: z.input<typeof UpdateSchema>, db: DB = getDb()) {
  await requireAdmin();
  const data = UpdateSchema.parse(input);
  db.update(artikel).set(data).where(eq(artikel.id, id)).run();
  revalidatePath("/verwaltung/artikel");
}
