import type { Ampel } from "@/lib/domain/verfall";

/** Kontrolllösung muss spätestens alle 31 Tage geprüft werden. */
export const BZ_KONTROLL_INTERVALL_TAGE = 31;

/** Warnfenster (Tage vor Fälligkeit → gelb). */
export const BZ_WARN_TAGE = 5;

export type BzFaelligkeit = {
  faelligAm: Date | null; // letzteKontrolle + 31 Tage; null wenn noch nie geprüft
  tageBisFaellig: number | null;
  ampel: Ampel; // gruen ok · gelb bald · rot überfällig/nie
  ueberfaellig: boolean;
  nieGeprueft: boolean;
};

/** Fälligkeit aus dem Datum der letzten Kontrolle. `null` = noch nie geprüft → rot. */
export function bzFaelligkeit(letzteKontrolle: Date | null, now: Date): BzFaelligkeit {
  if (letzteKontrolle === null) {
    return { faelligAm: null, tageBisFaellig: null, ampel: "rot", ueberfaellig: false, nieGeprueft: true };
  }
  const faelligAm = new Date(letzteKontrolle.getTime() + BZ_KONTROLL_INTERVALL_TAGE * 86_400_000);
  const tageBisFaellig = Math.ceil((faelligAm.getTime() - now.getTime()) / 86_400_000);
  const ueberfaellig = faelligAm.getTime() < now.getTime();
  let ampel: Ampel;
  if (ueberfaellig) ampel = "rot";
  else if (tageBisFaellig <= BZ_WARN_TAGE) ampel = "gelb";
  else ampel = "gruen";
  return { faelligAm, tageBisFaellig, ampel, ueberfaellig, nieGeprueft: false };
}

/** Ob ein Messwert im Referenzbereich liegt. null-Werte → null (nicht bewertbar). */
export function imBereich(wert: number | null, min: number | null, max: number | null): boolean | null {
  if (wert === null || min === null || max === null) return null;
  return wert >= min && wert <= max;
}

export type BzKontrolleBewertung = {
  level1ImBereich: boolean | null;
  level2ImBereich: boolean | null;
  bestanden: boolean;
};

/**
 * Bewertet eine Kontrolle gegen die (optional) am Gerät konfigurierten Level-Referenzbereiche.
 *
 * bestanden =
 *  - komplett leere Kontrolle (kein einziger Wert erfasst) → false (verhindert „vacuously true“).
 *  - mind. ein konfiguriertes Level (min UND max gesetzt) → ALLE konfigurierten Level müssen gemessen
 *    UND im Bereich sein.
 *  - kein Level konfiguriert, aber mind. ein Wert erfasst → true (kein Referenzbereich zum Verletzen).
 * Kompresse-Verfall/Sticks/Lanzetten/Batterie fließen NICHT in bestanden ein.
 */
export function bewerteKontrolle(g: {
  level1Wert: number | null;
  level1Min: number | null;
  level1Max: number | null;
  level2Wert: number | null;
  level2Min: number | null;
  level2Max: number | null;
}): BzKontrolleBewertung {
  const level1ImBereich = imBereich(g.level1Wert, g.level1Min, g.level1Max);
  const level2ImBereich = imBereich(g.level2Wert, g.level2Min, g.level2Max);
  const levels = [
    { wert: g.level1Wert, min: g.level1Min, max: g.level1Max, imB: level1ImBereich },
    { wert: g.level2Wert, min: g.level2Min, max: g.level2Max, imB: level2ImBereich },
  ];
  const hatWert = levels.some((l) => l.wert !== null);
  const konfiguriert = levels.filter((l) => l.min !== null && l.max !== null);
  let bestanden: boolean;
  if (!hatWert) {
    bestanden = false;
  } else if (konfiguriert.length > 0) {
    bestanden = konfiguriert.every((l) => l.wert !== null && l.imB === true);
  } else {
    bestanden = true;
  }
  return { level1ImBereich, level2ImBereich, bestanden };
}

export type BzAkkuKennzahl = { tageDurchschnitt: number | null; anzahlWechsel: number; anzahlIntervalle: number };

/**
 * Ø Batterie-/Akku-Lebensdauer: Zeitabstände zwischen aufeinanderfolgenden Batteriewechsel-
 * Ereignissen (ts der Kontrollen mit batterieGewechselt=true), gemittelt.
 * tageDurchschnitt = null wenn < 2 Wechsel (kein Intervall messbar).
 */
export function akkuLebensdauer(wechselTs: Date[]): BzAkkuKennzahl {
  const sorted = [...wechselTs].sort((a, b) => a.getTime() - b.getTime());
  const anzahlWechsel = sorted.length;
  const anzahlIntervalle = Math.max(0, anzahlWechsel - 1);
  if (anzahlIntervalle < 1) return { tageDurchschnitt: null, anzahlWechsel, anzahlIntervalle };
  let summe = 0;
  for (let i = 1; i < sorted.length; i++) summe += (sorted[i].getTime() - sorted[i - 1].getTime()) / 86_400_000;
  return { tageDurchschnitt: summe / anzahlIntervalle, anzahlWechsel, anzahlIntervalle };
}
