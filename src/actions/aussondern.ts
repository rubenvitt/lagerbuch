"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { requireAdmin } from "@/actions/session";
import { bestandProCharge } from "@/lib/domain/bestand";
import { verfallStatus } from "@/lib/domain/verfall";
import { config } from "@/lib/config";

const AussondernSchema = z.object({
  chargeId: z.string().min(1),
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
});

// Sondert eine ABGELAUFENE Charge aus: eine korrektur-Buchung menge=-rest für genau
// diese Charge (NICHT FEFO). artikelId wird aus der geladenen Charge abgeleitet.
export async function aussondern(input: z.input<typeof AussondernSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = AussondernSchema.parse(input);
  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };
  db.transaction((tx) => {
    const charge = tx.select().from(chargen).where(eq(chargen.id, v.chargeId)).get();
    if (!charge) throw new Error("Charge nicht gefunden");
    if (!verfallStatus(charge.verfall, opts, new Date()).abgelaufen) {
      throw new Error("Nur abgelaufene Chargen können ausgesondert werden");
    }
    const bu = tx.select().from(buchungen).where(eq(buchungen.chargeId, v.chargeId)).all();
    const rest = bestandProCharge(bu.map((b) => ({ chargeId: b.chargeId, menge: b.menge }))).get(v.chargeId) ?? 0;
    if (rest <= 0) throw new Error("Charge hat keinen Restbestand");
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ: "korrektur",
      artikelId: charge.artikelId, chargeId: charge.id, lagerortId: HANDLAGER_ID,
      menge: -rest, quelleTyp: "oidc", quelleId: userId, kommentar: v.kommentar,
    }).run();
  });
  revalidatePath("/verwaltung/verfall");
  revalidatePath("/verwaltung/artikel");
  revalidatePath("/verwaltung");
  return { ausgesondert: true as const };
}
