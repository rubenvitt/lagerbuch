"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { getDb, type DB } from "@/db";
import { tokens, lagerorte, artikel, newId } from "@/db/schema";
import { requireAdmin } from "@/actions/session";

const sixDigits = customAlphabet("0123456789", 6);

function generateUniqueCode(db: DB): string {
  for (let i = 0; i < 20; i++) {
    const d = sixDigits();
    const code = `${d.slice(0, 3)}-${d.slice(3)}`;
    if (!db.select().from(tokens).where(eq(tokens.code, code)).get()) return code;
  }
  throw new Error("Konnte keinen eindeutigen Code erzeugen");
}

const CreateSchema = z
  .object({
    label: z.string().trim().min(1, "Label erforderlich"),
    zielTyp: z.enum(["fahrzeug", "artikel"]).optional(),
    zielId: z.string().min(1).optional(),
  })
  // Ziel ist entweder komplett gesetzt (Typ + ID) oder gar nicht (allgemeiner Zugang).
  .refine((v) => (v.zielTyp ? Boolean(v.zielId) : !v.zielId), { message: "Ziel unvollständig", path: ["zielId"] });

export async function createToken(input: z.input<typeof CreateSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = CreateSchema.parse(input);

  // Ziel gegen die echten Daten prüfen, damit ein Code nie ins Leere zeigt.
  if (v.zielTyp === "fahrzeug") {
    const f = db.select().from(lagerorte).where(eq(lagerorte.id, v.zielId!)).get();
    if (!f || f.typ !== "fahrzeug") throw new Error("Fahrzeug nicht gefunden");
  } else if (v.zielTyp === "artikel") {
    const a = db.select().from(artikel).where(eq(artikel.id, v.zielId!)).get();
    if (!a) throw new Error("Artikel nicht gefunden");
  }

  const id = newId();
  const code = generateUniqueCode(db);
  db.insert(tokens)
    .values({
      id, code, label: v.label, aktiv: true, createdAt: new Date(), createdBy: userId,
      zielTyp: v.zielTyp ?? null, zielId: v.zielTyp ? v.zielId! : null,
    })
    .run();
  revalidatePath("/verwaltung/tokens");
  return { id, code };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });

export async function setTokenAktiv(input: z.input<typeof AktivSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = AktivSchema.parse(input);
  db.update(tokens).set({ aktiv: v.aktiv }).where(eq(tokens.id, v.id)).run();
  revalidatePath("/verwaltung/tokens");
}
