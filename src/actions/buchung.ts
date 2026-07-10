"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { artikel, buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { requireAdmin, requireHelfer } from "@/actions/session";
import { fefoVerteilung } from "@/lib/domain/fefo";
import { bestandProCharge } from "@/lib/domain/bestand";

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

type Quelle = { quelleTyp: "oidc" | "token"; quelleId: string };

// Gate-freier FEFO-Kern: eine Transaktion, Bestand-Kappung, gemeldete Ist-Menge.
// Von Admin- und Helfer-Wrapper geteilt (kein Copy-Paste der Transaktion).
function entnehmenCore(db: DB, artikelId: string, menge: number, quelle: Quelle, kommentar: string | null): { gebucht: number } {
  let gebucht = 0;
  db.transaction((tx) => {
    const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
    const bu = tx.select().from(buchungen).where(eq(buchungen.artikelId, artikelId)).all();
    const rest = bestandProCharge(bu.map((b) => ({ chargeId: b.chargeId, menge: b.menge })));
    const chargenRest = chs.map((c) => ({ chargeId: c.id, verfall: c.verfall, rest: rest.get(c.id) ?? 0 }));
    const verteilung = fefoVerteilung(chargenRest, menge);
    for (const teil of verteilung) {
      tx.insert(buchungen).values({
        id: newId(), ts: new Date(), typ: "entnahme", artikelId, chargeId: teil.chargeId,
        lagerortId: HANDLAGER_ID, menge: -teil.menge, quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
        kommentar,
      }).run();
      gebucht += teil.menge;
    }
  });
  return { gebucht };
}

export async function bucheEntnahme(input: z.input<typeof EntnahmeSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = EntnahmeSchema.parse(input);
  const r = entnehmenCore(db, v.artikelId, v.menge, { quelleTyp: "oidc", quelleId: userId }, v.kommentar ?? null);
  revalidatePath("/verwaltung/artikel");
  revalidatePath("/verwaltung");
  return r;
}

const HelferEntnahmeSchema = z.object({
  artikelId: z.string().min(1),
  menge: z.coerce.number().int().positive(),
});

export async function bucheEntnahmeHelfer(input: z.input<typeof HelferEntnahmeSchema>, db: DB = getDb()) {
  const { code } = await requireHelfer(db);
  const v = HelferEntnahmeSchema.parse(input);
  const r = entnehmenCore(db, v.artikelId, v.menge, { quelleTyp: "token", quelleId: code }, null);
  revalidatePath(`/a/${v.artikelId}`);
  revalidatePath("/helfer");
  revalidatePath("/verwaltung");
  return r;
}
