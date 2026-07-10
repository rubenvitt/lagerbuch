"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "@/db";
import { artikel, buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { requireAdmin } from "@/actions/session";

const HEADER = "name,einheit,fach,mindestbestand,startbestand";

const RowSchema = z.object({
  name: z.string().trim().min(1),
  einheit: z.string().trim().min(1),
  fach: z.string().trim().min(1),
  mindestbestand: z.coerce.number().int().min(0),
  startbestand: z.coerce.number().int().min(0),
});

export type ArtikelCsvRow = z.infer<typeof RowSchema>;

function splitLine(line: string): string[] {
  const delimiter = line.includes(";") ? ";" : ",";
  return line.split(delimiter).map((c) => c.trim());
}

export function parseArtikelCsv(text: string): { rows: ArtikelCsvRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: ArtikelCsvRow[] = [];
  const errors: string[] = [];
  let dataLines = lines;
  if (lines.length > 0) {
    const headerCols = splitLine(lines[0]).join(",");
    if (headerCols === HEADER) dataLines = lines.slice(1);
  }
  for (const line of dataLines) {
    const cols = splitLine(line);
    if (cols.length !== 5) {
      errors.push(`Ungültige Zeile: "${line}"`);
      continue;
    }
    const [name, einheit, fach, mindestbestand, startbestand] = cols;
    const parsed = RowSchema.safeParse({ name, einheit, fach, mindestbestand, startbestand });
    if (!parsed.success) {
      errors.push(`Ungültige Zeile: "${line}"`);
      continue;
    }
    rows.push(parsed.data);
  }
  return { rows, errors };
}

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
