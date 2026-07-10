"use server";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "@/db";
import { artikel, buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { requireAdmin } from "@/actions/session";
import { parseArtikelCsv } from "@/lib/csv";

export async function importArtikelCsv(text: string, db: DB = getDb()): Promise<{ angelegt: number; fehler: string[] }> {
  const { userId } = await requireAdmin();
  const { rows, errors } = parseArtikelCsv(text);
  const fehler = [...errors];
  let angelegt = 0;
  for (const row of rows) {
    db.transaction((tx) => {
      const artikelId = newId();
      tx.insert(artikel)
        .values({
          id: artikelId,
          name: row.name,
          einheit: row.einheit,
          fach: row.fach,
          mindestbestand: row.mindestbestand,
          aktiv: true,
          createdAt: new Date(),
        })
        .run();
      if (row.startbestand > 0) {
        const chargeId = newId();
        tx.insert(chargen)
          .values({ id: chargeId, artikelId, chargenNr: "ohne Verfall", verfall: "2099-12", createdAt: new Date() })
          .run();
        tx.insert(buchungen)
          .values({
            id: newId(),
            ts: new Date(),
            typ: "korrektur",
            artikelId,
            chargeId,
            lagerortId: HANDLAGER_ID,
            menge: row.startbestand,
            quelleTyp: "oidc",
            quelleId: userId,
            kommentar: "CSV-Startbestand",
          })
          .run();
      }
    });
    angelegt += 1;
  }
  revalidatePath("/verwaltung/artikel");
  return { angelegt, fehler };
}
