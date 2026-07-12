"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { artikel } from "@/db/schema";
import { requireAdmin } from "@/actions/session";

const Schema = z.object({ artikelId: z.string().min(1), bestellt: z.boolean() });

export async function markiereBestellt(input: z.input<typeof Schema>, db: DB = getDb()) {
  await requireAdmin();
  const v = Schema.parse(input);
  db.update(artikel).set({ bestelltAt: v.bestellt ? new Date() : null }).where(eq(artikel.id, v.artikelId)).run();
  revalidatePath("/verwaltung/bestellung");
  revalidatePath("/verwaltung");
}
