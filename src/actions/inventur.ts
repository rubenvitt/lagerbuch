"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { requireAdmin } from "@/actions/session";
import { fefoAbbuchung } from "@/db/abbuchung";

const Schema = z.object({
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
  positionen: z.array(z.object({ artikelId: z.string().min(1), ist: z.coerce.number().int().min(0) })).min(1),
});

// Inventur (§7 Regel 7): je Position diff = ist - bestandJetzt. diff==0 -> skip.
// diff<0 -> FEFO-korrektur. diff>0 -> +diff auf die juengste existierende Charge (max verfall,
// Tiebreak neuestes createdAt), neue Charge nur wenn keine existiert. Alles in EINER Transaktion.
export async function inventurKorrektur(input: z.input<typeof Schema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = Schema.parse(input);
  const referenz = `inventur:${newId()}`;
  let korrigiert = 0;
  db.transaction((tx) => {
    for (const p of v.positionen) {
      const bu = tx.select().from(buchungen).where(eq(buchungen.artikelId, p.artikelId)).all();
      const bestandJetzt = bu.reduce((s, b) => s + b.menge, 0);
      const diff = p.ist - bestandJetzt;
      if (diff === 0) continue;
      if (diff < 0) {
        fefoAbbuchung(tx, { artikelId: p.artikelId, menge: -diff, quelle: { quelleTyp: "oidc", quelleId: userId }, kommentar: v.kommentar, referenz, typ: "korrektur" });
      } else {
        const chs = tx.select().from(chargen).where(eq(chargen.artikelId, p.artikelId)).all();
        let chargeId: string;
        if (chs.length > 0) {
          const juengste = chs.slice().sort((a, b) => b.verfall.localeCompare(a.verfall) || (b.createdAt.getTime() - a.createdAt.getTime()))[0];
          chargeId = juengste.id;
        } else {
          chargeId = newId();
          tx.insert(chargen).values({ id: chargeId, artikelId: p.artikelId, chargenNr: "Inventur", verfall: "2099-12", createdAt: new Date() }).run();
        }
        tx.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "korrektur", artikelId: p.artikelId, chargeId, lagerortId: HANDLAGER_ID, menge: diff, quelleTyp: "oidc", quelleId: userId, referenz, kommentar: v.kommentar }).run();
      }
      korrigiert++;
    }
  });
  revalidatePath("/verwaltung/inventur");
  revalidatePath("/verwaltung/artikel");
  revalidatePath("/verwaltung");
  return { korrigiert };
}
