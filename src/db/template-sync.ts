import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { lagerorte, sollPositionen, templatePositionen, newId } from "@/db/schema";

export type SyncErgebnis = {
  hinzugefuegt: number; // neue Positionen aus der Vorlage materialisiert
  aktualisiert: number; // Vorlagen-Positionen an die Vorlage angeglichen
  uebersprungen: number; // manuell überschrieben / entfernt → unangetastet
  entfernt: number; // in der Vorlage gelöschte Positionen aus dem Fahrzeug entfernt
  losgeloest: number; // überschriebene Waisen zu manuellen Positionen gemacht
};

// Materialisiert die Positionen der verknüpften Vorlage in die soll_positionen des Fahrzeugs.
// Der Check-Flow liest weiterhin ausschließlich soll_positionen — deshalb wird nichts „live"
// berechnet, sondern beim Sync konkret geschrieben. Manuelle Überschreibungen (ueberschrieben)
// und bewusste Auslassungen (entfernt) bleiben erhalten; nur unveränderte Vorlagen-Zeilen und
// Neuzugänge werden angefasst.
//
// Muss innerhalb einer Transaktion laufen, wenn Atomarität gefordert ist — die Aufrufer
// (Actions) übergeben dafür die tx als `db`.
export function syncFahrzeugTemplate(db: DB, fahrzeugId: string): SyncErgebnis {
  const erg: SyncErgebnis = { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0 };
  const fahrzeug = db.select().from(lagerorte).where(eq(lagerorte.id, fahrzeugId)).get();
  if (!fahrzeug?.templateId) return erg;

  const tpRows = db.select().from(templatePositionen).where(eq(templatePositionen.templateId, fahrzeug.templateId)).all();
  const tpById = new Map(tpRows.map((t) => [t.id, t]));

  const existing = db.select().from(sollPositionen).where(eq(sollPositionen.fahrzeugId, fahrzeugId)).all();
  const linkedByTp = new Map<string, (typeof existing)[number]>();
  for (const r of existing) if (r.templatePositionId) linkedByTp.set(r.templatePositionId, r);

  // 1. Jede Vorlagen-Position anlegen oder angleichen.
  for (const tp of tpRows) {
    const row = linkedByTp.get(tp.id);
    if (!row) {
      db.insert(sollPositionen)
        .values({
          id: newId(), fahrzeugId, fachLabel: tp.fachLabel, sort: tp.sort,
          artikelId: tp.artikelId, soll: tp.soll, templatePositionId: tp.id,
          ueberschrieben: false, entfernt: false,
        })
        .run();
      erg.hinzugefuegt++;
      continue;
    }
    if (row.ueberschrieben || row.entfernt) {
      erg.uebersprungen++; // manuell angepasst oder bewusst ausgelassen → in Ruhe lassen
      continue;
    }
    // Unveränderte Vorlagen-Zeile: nur schreiben, wenn sich etwas geändert hat.
    if (row.fachLabel !== tp.fachLabel || row.sort !== tp.sort || row.artikelId !== tp.artikelId || row.soll !== tp.soll) {
      db.update(sollPositionen)
        .set({ fachLabel: tp.fachLabel, sort: tp.sort, artikelId: tp.artikelId, soll: tp.soll })
        .where(eq(sollPositionen.id, row.id))
        .run();
      erg.aktualisiert++;
    }
  }

  // 2. Verwaiste Vorlagen-Zeilen behandeln (Position wurde aus der Vorlage gelöscht).
  for (const r of existing) {
    if (!r.templatePositionId || tpById.has(r.templatePositionId)) continue;
    if (r.ueberschrieben) {
      // Überschreibung war gewollt → als manuelle Position erhalten, nur von der Vorlage lösen.
      db.update(sollPositionen).set({ templatePositionId: null, ueberschrieben: false }).where(eq(sollPositionen.id, r.id)).run();
      erg.losgeloest++;
    } else {
      db.delete(sollPositionen).where(eq(sollPositionen.id, r.id)).run();
      erg.entfernt++;
    }
  }

  return erg;
}
