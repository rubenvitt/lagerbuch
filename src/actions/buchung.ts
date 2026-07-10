"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { artikel, buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { requireAdmin } from "@/actions/session";

const ZugangSchema = z
  .object({
    artikelId: z.string().min(1),
    menge: z.coerce.number().int().positive(),
    chargeId: z.string().min(1).optional(),
    neueCharge: z.object({ chargenNr: z.string().trim().min(1), verfall: z.string().regex(/^\d{4}-\d{2}$/) }).optional(),
  })
  .refine((v) => Boolean(v.chargeId) !== Boolean(v.neueCharge), { message: "Genau eine Charge angeben" });

export async function bucheZugang(input: z.input<typeof ZugangSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = ZugangSchema.parse(input);
  db.transaction((tx) => {
    let chargeId = v.chargeId!;
    if (v.neueCharge) {
      chargeId = newId();
      tx.insert(chargen).values({ id: chargeId, artikelId: v.artikelId, chargenNr: v.neueCharge.chargenNr, verfall: v.neueCharge.verfall, createdAt: new Date() }).run();
    }
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ: "zugang", artikelId: v.artikelId, chargeId,
      lagerortId: HANDLAGER_ID, menge: v.menge, quelleTyp: "oidc", quelleId: userId, kommentar: null,
    }).run();
    tx.update(artikel).set({ bestelltAt: null }).where(eq(artikel.id, v.artikelId)).run();
  });
  revalidatePath("/verwaltung/artikel");
  revalidatePath("/verwaltung");
}
