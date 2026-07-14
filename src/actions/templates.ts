"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { fahrzeugTemplates, templatePositionen, lagerorte, sollPositionen, newId } from "@/db/schema";
import { requireAdmin } from "@/actions/session";
import { syncFahrzeugTemplate, type SyncErgebnis } from "@/db/template-sync";

function revalidate(fahrzeugId?: string) {
  revalidatePath("/verwaltung/vorlagen");
  revalidatePath("/verwaltung/fahrzeuge");
  if (fahrzeugId) revalidatePath(`/verwaltung/fahrzeuge/${fahrzeugId}`);
}

// ── Vorlagen ────────────────────────────────────────────────────────────────

const TemplateSchema = z.object({ name: z.string().trim().min(1) });
export async function createTemplate(input: z.input<typeof TemplateSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = TemplateSchema.parse(input);
  const id = newId();
  db.insert(fahrzeugTemplates).values({ id, name: v.name, aktiv: true, createdAt: new Date() }).run();
  revalidate();
  return { id };
}

const RenameSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1) });
export async function renameTemplate(input: z.input<typeof RenameSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = RenameSchema.parse(input);
  db.update(fahrzeugTemplates).set({ name: v.name }).where(eq(fahrzeugTemplates.id, v.id)).run();
  revalidate();
}

const TemplateAktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });
export async function setTemplateAktiv(input: z.input<typeof TemplateAktivSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = TemplateAktivSchema.parse(input);
  db.update(fahrzeugTemplates).set({ aktiv: v.aktiv }).where(eq(fahrzeugTemplates.id, v.id)).run();
  revalidate();
}

// Löscht eine Vorlage. Verknüpfte Fahrzeuge werden vorher gelöst (ihre materialisierten
// Positionen bleiben als individuelle Bestückung erhalten), damit keine Fremdschlüssel brechen.
const DeleteTemplateSchema = z.object({ id: z.string().min(1) });
export async function deleteTemplate(input: z.input<typeof DeleteTemplateSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = DeleteTemplateSchema.parse(input);
  db.transaction((tx) => {
    const fahrzeuge = tx.select().from(lagerorte).where(eq(lagerorte.templateId, v.id)).all();
    for (const f of fahrzeuge) loeseFahrzeugVonTemplate(tx, f.id);
    tx.delete(templatePositionen).where(eq(templatePositionen.templateId, v.id)).run();
    tx.delete(fahrzeugTemplates).where(eq(fahrzeugTemplates.id, v.id)).run();
  });
  revalidate();
}

// ── Vorlagen-Positionen ───────────────────────────────────────────────────────

const TemplatePosSchema = z.object({
  id: z.string().min(1).optional(),
  templateId: z.string().min(1),
  fachLabel: z.string().trim().min(1),
  artikelId: z.string().min(1),
  soll: z.coerce.number().int().positive(),
  sort: z.coerce.number().int().default(0),
});
export async function templatePositionSetzen(input: z.input<typeof TemplatePosSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = TemplatePosSchema.parse(input);
  const id = v.id ?? newId();
  if (v.id) {
    db.update(templatePositionen).set({ templateId: v.templateId, fachLabel: v.fachLabel, artikelId: v.artikelId, soll: v.soll, sort: v.sort }).where(eq(templatePositionen.id, v.id)).run();
  } else {
    db.insert(templatePositionen).values({ id, templateId: v.templateId, fachLabel: v.fachLabel, artikelId: v.artikelId, soll: v.soll, sort: v.sort }).run();
  }
  revalidate();
  return { id };
}

const TemplatePosEntfernenSchema = z.object({ id: z.string().min(1) });
export async function templatePositionEntfernen(input: z.input<typeof TemplatePosEntfernenSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = TemplatePosEntfernenSchema.parse(input);
  db.transaction((tx) => {
    // Referenzierende Fahrzeug-Positionen zuerst auflösen (sonst FK-Verletzung) — dieselbe Logik
    // wie beim Sync von Waisen: Überschreibungen als manuell erhalten, den Rest löschen.
    const referenzierend = tx.select().from(sollPositionen).where(eq(sollPositionen.templatePositionId, v.id)).all();
    for (const r of referenzierend) {
      if (r.ueberschrieben) {
        tx.update(sollPositionen).set({ templatePositionId: null, ueberschrieben: false }).where(eq(sollPositionen.id, r.id)).run();
      } else {
        tx.delete(sollPositionen).where(eq(sollPositionen.id, r.id)).run();
      }
    }
    tx.delete(templatePositionen).where(eq(templatePositionen.id, v.id)).run();
  });
  revalidate();
}

// ── Fahrzeug ↔ Vorlage ────────────────────────────────────────────────────────

// Weist einem Fahrzeug eine Vorlage zu (oder wechselt sie) und synchronisiert sofort.
const ZuweisenSchema = z.object({ fahrzeugId: z.string().min(1), templateId: z.string().min(1) });
export async function fahrzeugTemplateZuweisen(input: z.input<typeof ZuweisenSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = ZuweisenSchema.parse(input);
  let erg: SyncErgebnis;
  db.transaction((tx) => {
    tx.update(lagerorte).set({ templateId: v.templateId }).where(eq(lagerorte.id, v.fahrzeugId)).run();
    erg = syncFahrzeugTemplate(tx, v.fahrzeugId);
  });
  revalidate(v.fahrzeugId);
  return erg!;
}

// Erneuter Sync eines bereits verknüpften Fahrzeugs (nach Vorlagen-Änderung).
const SyncSchema = z.object({ fahrzeugId: z.string().min(1) });
export async function fahrzeugTemplateSync(input: z.input<typeof SyncSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = SyncSchema.parse(input);
  let erg: SyncErgebnis;
  db.transaction((tx) => {
    erg = syncFahrzeugTemplate(tx, v.fahrzeugId);
  });
  revalidate(v.fahrzeugId);
  return erg!;
}

// Synchronisiert ALLE Fahrzeuge einer Vorlage (nach Vorlagen-Bearbeitung).
const SyncAlleSchema = z.object({ templateId: z.string().min(1) });
export async function templateAufFahrzeugeSyncen(input: z.input<typeof SyncAlleSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = SyncAlleSchema.parse(input);
  let fahrzeuge = 0;
  const summe: SyncErgebnis = { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0 };
  db.transaction((tx) => {
    const rows = tx.select().from(lagerorte).where(eq(lagerorte.templateId, v.templateId)).all();
    fahrzeuge = rows.length;
    for (const f of rows) {
      const e = syncFahrzeugTemplate(tx, f.id);
      summe.hinzugefuegt += e.hinzugefuegt;
      summe.aktualisiert += e.aktualisiert;
      summe.uebersprungen += e.uebersprungen;
      summe.entfernt += e.entfernt;
      summe.losgeloest += e.losgeloest;
    }
  });
  revalidate();
  return { fahrzeuge, ...summe };
}

// Löst die Verknüpfung: die materialisierten Positionen bleiben als individuelle Bestückung
// erhalten (Grabsteine werden verworfen). So verliert das Fahrzeug nichts, wird aber unabhängig.
const LoesenSchema = z.object({ fahrzeugId: z.string().min(1) });
export async function fahrzeugTemplateLoesen(input: z.input<typeof LoesenSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = LoesenSchema.parse(input);
  db.transaction((tx) => loeseFahrzeugVonTemplate(tx, v.fahrzeugId));
  revalidate(v.fahrzeugId);
}

function loeseFahrzeugVonTemplate(tx: DB, fahrzeugId: string) {
  // Grabsteine (bewusst ausgelassene Vorlagen-Positionen) verwerfen — ohne Verknüpfung
  // ergeben sie keinen Sinn mehr.
  tx.delete(sollPositionen).where(and(eq(sollPositionen.fahrzeugId, fahrzeugId), eq(sollPositionen.entfernt, true))).run();
  // Materialisierte Positionen als individuelle Bestückung behalten, nur von der Vorlage lösen.
  tx.update(sollPositionen)
    .set({ templatePositionId: null, ueberschrieben: false })
    .where(and(eq(sollPositionen.fahrzeugId, fahrzeugId), isNotNull(sollPositionen.templatePositionId)))
    .run();
  tx.update(lagerorte).set({ templateId: null }).where(eq(lagerorte.id, fahrzeugId)).run();
}

// Erstellt eine neue Vorlage aus der aktuellen (nicht entfernten) Bestückung eines Fahrzeugs.
// Ideal, um „mehrere identisch gepackte Fahrzeuge" zu vereinheitlichen: ein gut gepacktes
// Fahrzeug wird zur Vorlage, die dann auf die übrigen übertragen wird.
const AusFahrzeugSchema = z.object({ fahrzeugId: z.string().min(1), name: z.string().trim().min(1), verknuepfen: z.boolean().default(true) });
export async function templateAusFahrzeug(input: z.input<typeof AusFahrzeugSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = AusFahrzeugSchema.parse(input);
  const templateId = newId();
  db.transaction((tx) => {
    tx.insert(fahrzeugTemplates).values({ id: templateId, name: v.name, aktiv: true, createdAt: new Date() }).run();
    const rows = tx.select().from(sollPositionen).where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all().filter((r) => !r.entfernt);
    for (const r of rows) {
      tx.insert(templatePositionen).values({ id: newId(), templateId, fachLabel: r.fachLabel, sort: r.sort, artikelId: r.artikelId, soll: r.soll }).run();
    }
    if (v.verknuepfen) {
      // Fahrzeug an die neue Vorlage hängen und die vorhandenen Zeilen adoptieren, damit keine
      // Duplikate entstehen: bestehende (nicht entfernte) manuelle Zeilen werden zu Vorlagen-Zeilen.
      tx.update(lagerorte).set({ templateId }).where(eq(lagerorte.id, v.fahrzeugId)).run();
      const tpRows = tx.select().from(templatePositionen).where(eq(templatePositionen.templateId, templateId)).all();
      const soll = tx.select().from(sollPositionen).where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all().filter((r) => !r.entfernt);
      // Paare in Anlage-Reihenfolge zuordnen (gleiche Menge, gleiche Reihenfolge).
      for (let i = 0; i < soll.length && i < tpRows.length; i++) {
        tx.update(sollPositionen).set({ templatePositionId: tpRows[i].id, ueberschrieben: false }).where(eq(sollPositionen.id, soll[i].id)).run();
      }
    }
  });
  revalidate(v.fahrzeugId);
  return { id: templateId };
}
