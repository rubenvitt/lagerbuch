"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { checks, sollPositionen, newId } from "@/db/schema";
import { requireHelfer } from "@/actions/session";
import { fefoAbbuchung } from "@/db/abbuchung";

const CheckSchema = z.object({
  fahrzeugId: z.string().min(1),
  positionen: z.array(z.object({ sollPositionId: z.string().min(1), ist: z.coerce.number().int().min(0) })).min(1),
});

// Fahrzeug-Check-Abschluss (§7 Regel 6): EINE Transaktion → checks-Zeile + je Fehlmenge
// eine FEFO-Handlager-Entnahme mit referenz="check:<id>". Soll/artikelId kommen serverseitig
// aus der sollPositionen-Zeile (per sollPositionId), nie vom Client.
export async function checkAbschluss(input: z.input<typeof CheckSchema>, db: DB = getDb()) {
  const { code } = await requireHelfer(db);
  const v = CheckSchema.parse(input);
  const checkId = newId();
  db.transaction((tx) => {
    const sollRows = tx.select().from(sollPositionen).where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all();
    const byId = new Map(sollRows.map((s) => [s.id, s]));
    const ergebnis = v.positionen.map((p) => {
      const row = byId.get(p.sollPositionId);
      if (!row) throw new Error("Soll-Position gehört nicht zu diesem Fahrzeug");
      const fehlt = Math.max(0, row.soll - p.ist);
      const gebucht = fehlt > 0
        ? fefoAbbuchung(tx, { artikelId: row.artikelId, menge: fehlt, quelle: { quelleTyp: "token", quelleId: code }, kommentar: null, referenz: `check:${checkId}` })
        : 0;
      return { sollPositionId: row.id, artikelId: row.artikelId, soll: row.soll, ist: p.ist, fehlt, gebucht };
    });
    tx.insert(checks).values({
      id: checkId, fahrzeugId: v.fahrzeugId, quelleTyp: "token", quelleId: code,
      startedAt: new Date(), completedAt: new Date(), ergebnis: JSON.stringify(ergebnis),
    }).run();
  });
  revalidatePath("/helfer/check");
  revalidatePath("/verwaltung/checks");
  revalidatePath("/verwaltung");
  return { checkId };
}
