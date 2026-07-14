import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import type { DB } from "@/db";
import { artikel, sollPositionen, lagerorte, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createFahrzeug, sollPositionSetzen, sollPositionEntfernen } from "./fahrzeuge";
import {
  createTemplate, templatePositionSetzen, templatePositionEntfernen,
  fahrzeugTemplateZuweisen, fahrzeugTemplateSync, fahrzeugTemplateLoesen,
  templateAufFahrzeugeSyncen, templateAusFahrzeug, deleteTemplate,
} from "./templates";
import { sollFuerFahrzeug, templateDetail, templateUebersicht } from "@/db/queries";

function seedArtikel(db: DB, name = "NaCl", fach = "B2") {
  const a = newId();
  db.insert(artikel).values({ id: a, name, einheit: "Fl.", fach, mindestbestand: 0, createdAt: new Date() }).run();
  return a;
}

// aktive (nicht entfernte) Positionen
function aktiv(db: DB, fz: string) {
  return sollFuerFahrzeug(db, fz).filter((p) => !p.entfernt);
}

describe("Fahrzeug-Vorlagen", () => {
  it("Zuweisen materialisiert Vorlagen-Positionen ins Fahrzeug", async () => {
    const db = createTestDb();
    const a = seedArtikel(db);
    const { id: t } = await createTemplate({ name: "RTW-Standard" }, db);
    await templatePositionSetzen({ templateId: t, fachLabel: "Schrank 1", artikelId: a, soll: 4 }, db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);

    const erg = await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: t }, db);
    expect(erg.hinzugefuegt).toBe(1);
    const list = aktiv(db, fz);
    expect(list).toHaveLength(1);
    expect(list[0].soll).toBe(4);
    expect(list[0].herkunft).toBe("vorlage");
    expect(db.select().from(lagerorte).where(eq(lagerorte.id, fz)).get()!.templateId).toBe(t);
  });

  it("Sync übernimmt Vorlagen-Änderungen für nicht überschriebene Positionen", async () => {
    const db = createTestDb();
    const a = seedArtikel(db);
    const { id: t } = await createTemplate({ name: "T" }, db);
    const { id: tp } = await templatePositionSetzen({ templateId: t, fachLabel: "S1", artikelId: a, soll: 4 }, db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: t }, db);

    await templatePositionSetzen({ id: tp, templateId: t, fachLabel: "S1", artikelId: a, soll: 6 }, db);
    const erg = await fahrzeugTemplateSync({ fahrzeugId: fz }, db);
    expect(erg.aktualisiert).toBe(1);
    expect(aktiv(db, fz)[0].soll).toBe(6);
  });

  it("Manuelle Überschreibung bleibt beim Sync erhalten", async () => {
    const db = createTestDb();
    const a = seedArtikel(db);
    const { id: t } = await createTemplate({ name: "T" }, db);
    const { id: tp } = await templatePositionSetzen({ templateId: t, fachLabel: "S1", artikelId: a, soll: 4 }, db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: t }, db);

    // Fahrzeug-Position manuell auf 10 setzen → ueberschrieben
    const posId = aktiv(db, fz)[0].id;
    await sollPositionSetzen({ id: posId, fahrzeugId: fz, fachLabel: "S1", artikelId: a, soll: 10 }, db);
    expect(aktiv(db, fz)[0].herkunft).toBe("ueberschrieben");

    // Vorlage ändern + sync: Überschreibung darf NICHT überschrieben werden
    await templatePositionSetzen({ id: tp, templateId: t, fachLabel: "S1", artikelId: a, soll: 6 }, db);
    const erg = await fahrzeugTemplateSync({ fahrzeugId: fz }, db);
    expect(erg.uebersprungen).toBe(1);
    expect(erg.aktualisiert).toBe(0);
    expect(aktiv(db, fz)[0].soll).toBe(10);
  });

  it("Entfernen einer Vorlagen-Position setzt Grabstein statt Löschen; Sync legt sie nicht neu an", async () => {
    const db = createTestDb();
    const a = seedArtikel(db);
    const { id: t } = await createTemplate({ name: "T" }, db);
    await templatePositionSetzen({ templateId: t, fachLabel: "S1", artikelId: a, soll: 4 }, db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: t }, db);

    const posId = aktiv(db, fz)[0].id;
    await sollPositionEntfernen({ id: posId }, db);
    // Grabstein bleibt als Zeile bestehen, zählt aber nicht mehr als aktives Soll
    expect(aktiv(db, fz)).toHaveLength(0);
    expect(sollFuerFahrzeug(db, fz)).toHaveLength(1);
    expect(sollFuerFahrzeug(db, fz)[0].entfernt).toBe(true);

    // Sync legt die Position nicht wieder an (Grabstein schützt davor)
    const erg = await fahrzeugTemplateSync({ fahrzeugId: fz }, db);
    expect(erg.hinzugefuegt).toBe(0);
    expect(erg.uebersprungen).toBe(1);
    expect(aktiv(db, fz)).toHaveLength(0);
  });

  it("Löschen einer Vorlagen-Position propagiert: nicht überschrieben → weg, überschrieben → manuell erhalten", async () => {
    const db = createTestDb();
    const a = seedArtikel(db, "NaCl");
    const b = seedArtikel(db, "Pflaster", "C1");
    const { id: t } = await createTemplate({ name: "T" }, db);
    const { id: tpA } = await templatePositionSetzen({ templateId: t, fachLabel: "S1", artikelId: a, soll: 4 }, db);
    const { id: tpB } = await templatePositionSetzen({ templateId: t, fachLabel: "S1", artikelId: b, soll: 2 }, db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: t }, db);

    // b überschreiben, dann beide Vorlagen-Positionen löschen (FK-sicher, Auflösung sofort)
    const posB = aktiv(db, fz).find((p) => p.artikelId === b)!.id;
    await sollPositionSetzen({ id: posB, fahrzeugId: fz, fachLabel: "S1", artikelId: b, soll: 9 }, db);
    await templatePositionEntfernen({ id: tpA }, db); // a: nicht überschrieben → aus Fahrzeug entfernt
    await templatePositionEntfernen({ id: tpB }, db); // b: überschrieben → als manuelle Position erhalten

    const list = aktiv(db, fz);
    expect(list).toHaveLength(1);
    expect(list[0].artikelId).toBe(b);
    expect(list[0].herkunft).toBe("manuell");
    expect(list[0].soll).toBe(9);
    expect(templateDetail(db, t)!.positionen).toHaveLength(0);
  });

  it("templateAusFahrzeug erstellt Vorlage aus Bestückung und verknüpft ohne Duplikate", async () => {
    const db = createTestDb();
    const a = seedArtikel(db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);
    await sollPositionSetzen({ fahrzeugId: fz, fachLabel: "S1", artikelId: a, soll: 3 }, db);

    const { id: t } = await templateAusFahrzeug({ fahrzeugId: fz, name: "Aus RTW 1", verknuepfen: true }, db);
    const det = templateDetail(db, t)!;
    expect(det.positionen).toHaveLength(1);
    expect(det.positionen[0].soll).toBe(3);
    // Fahrzeug ist verknüpft, hat aber genau EINE Position (adoptiert, nicht dupliziert)
    const list = aktiv(db, fz);
    expect(list).toHaveLength(1);
    expect(list[0].herkunft).toBe("vorlage");
    // erneuter Sync ändert nichts
    const erg = await fahrzeugTemplateSync({ fahrzeugId: fz }, db);
    expect(erg.hinzugefuegt).toBe(0);
    expect(aktiv(db, fz)).toHaveLength(1);
  });

  it("Verknüpfung lösen behält Positionen als manuell und verwirft Grabsteine", async () => {
    const db = createTestDb();
    const a = seedArtikel(db, "NaCl");
    const b = seedArtikel(db, "Pflaster", "C1");
    const { id: t } = await createTemplate({ name: "T" }, db);
    await templatePositionSetzen({ templateId: t, fachLabel: "S1", artikelId: a, soll: 4 }, db);
    await templatePositionSetzen({ templateId: t, fachLabel: "S1", artikelId: b, soll: 2 }, db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: t }, db);

    // b entfernen (Grabstein)
    await sollPositionEntfernen({ id: aktiv(db, fz).find((p) => p.artikelId === b)!.id }, db);
    await fahrzeugTemplateLoesen({ fahrzeugId: fz }, db);

    expect(db.select().from(lagerorte).where(eq(lagerorte.id, fz)).get()!.templateId).toBeNull();
    const rows = db.select().from(sollPositionen).where(eq(sollPositionen.fahrzeugId, fz)).all();
    expect(rows).toHaveLength(1); // Grabstein weg, a bleibt
    expect(rows[0].artikelId).toBe(a);
    expect(rows[0].templatePositionId).toBeNull();
    expect(aktiv(db, fz)[0].herkunft).toBe("manuell");
  });

  it("templateAufFahrzeugeSyncen synchronisiert alle verknüpften Fahrzeuge", async () => {
    const db = createTestDb();
    const a = seedArtikel(db);
    const { id: t } = await createTemplate({ name: "T" }, db);
    const { id: tp } = await templatePositionSetzen({ templateId: t, fachLabel: "S1", artikelId: a, soll: 4 }, db);
    const { id: fz1 } = await createFahrzeug({ name: "RTW 1" }, db);
    const { id: fz2 } = await createFahrzeug({ name: "RTW 2" }, db);
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz1, templateId: t }, db);
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz2, templateId: t }, db);

    await templatePositionSetzen({ id: tp, templateId: t, fachLabel: "S1", artikelId: a, soll: 7 }, db);
    const erg = await templateAufFahrzeugeSyncen({ templateId: t }, db);
    expect(erg.fahrzeuge).toBe(2);
    expect(erg.aktualisiert).toBe(2);
    expect(aktiv(db, fz1)[0].soll).toBe(7);
    expect(aktiv(db, fz2)[0].soll).toBe(7);
    expect(templateUebersicht(db).find((x) => x.id === t)!.fahrzeuge).toBe(2);
  });

  it("deleteTemplate löst Fahrzeuge und behält deren Bestückung", async () => {
    const db = createTestDb();
    const a = seedArtikel(db);
    const { id: t } = await createTemplate({ name: "T" }, db);
    await templatePositionSetzen({ templateId: t, fachLabel: "S1", artikelId: a, soll: 4 }, db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);
    await fahrzeugTemplateZuweisen({ fahrzeugId: fz, templateId: t }, db);

    await deleteTemplate({ id: t }, db);
    expect(templateDetail(db, t)).toBeNull();
    expect(db.select().from(lagerorte).where(eq(lagerorte.id, fz)).get()!.templateId).toBeNull();
    const list = aktiv(db, fz);
    expect(list).toHaveLength(1);
    expect(list[0].herkunft).toBe("manuell");
  });
});
