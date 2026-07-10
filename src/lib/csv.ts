import { z } from "zod";

export const HEADER = "name,einheit,fach,mindestbestand,startbestand";

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
