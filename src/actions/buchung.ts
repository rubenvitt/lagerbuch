"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { artikel, buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { requireAdmin, requireHelfer } from "@/actions/session";
import { fefoAbbuchung } from "@/db/abbuchung";

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
    } else {
      // A crafted request could pass a chargeId that belongs to a different article; without
      // this check the zugang would book onto the wrong article's stock (phantom, un-withdrawable
      // Bestand on the target article).
      const charge = tx.select().from(chargen).where(eq(chargen.id, chargeId)).get();
      if (!charge || charge.artikelId !== v.artikelId) {
        throw new Error("Charge gehört nicht zu diesem Artikel");
      }
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

const EntnahmeSchema = z.object({
  artikelId: z.string().min(1),
  menge: z.coerce.number().int().positive(),
  kommentar: z.string().trim().optional(),
});

export async function bucheEntnahme(input: z.input<typeof EntnahmeSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = EntnahmeSchema.parse(input);
  let gebucht = 0;
  db.transaction((tx) => {
    gebucht = fefoAbbuchung(tx, { artikelId: v.artikelId, menge: v.menge, quelle: { quelleTyp: "oidc", quelleId: userId }, kommentar: v.kommentar ?? null, referenz: null });
  });
  revalidatePath("/verwaltung/artikel");
  revalidatePath("/verwaltung");
  return { gebucht };
}

const HelferEntnahmeSchema = z.object({
  artikelId: z.string().min(1),
  menge: z.coerce.number().int().positive(),
});

export async function bucheEntnahmeHelfer(input: z.input<typeof HelferEntnahmeSchema>, db: DB = getDb()) {
  const { code } = await requireHelfer(db);
  const v = HelferEntnahmeSchema.parse(input);
  let gebucht = 0;
  db.transaction((tx) => {
    gebucht = fefoAbbuchung(tx, { artikelId: v.artikelId, menge: v.menge, quelle: { quelleTyp: "token", quelleId: code }, kommentar: null, referenz: null });
  });
  revalidatePath(`/a/${v.artikelId}`);
  revalidatePath("/helfer");
  revalidatePath("/verwaltung");
  return { gebucht };
}
