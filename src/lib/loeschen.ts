// Reine Typen/Konstanten rund ums Löschen. Bewusst KEIN "use server": Server-Action-Module
// dürfen nur async Funktionen exportieren, daher liegen Const & Typen hier.

export const ELEMENT_ARTEN = ["artikel", "fahrzeug", "token", "bzGeraet", "o2Flasche", "geraet"] as const;
export type ElementArt = (typeof ELEMENT_ARTEN)[number];

/**
 * Ergebnis der Löschbarkeits-Prüfung. `loeschbar: false` bedeutet: es hängt Historie dran, die im
 * append-only System erhalten bleiben muss — hartes Löschen ist gesperrt, Deaktivieren bleibt möglich.
 */
export type Loeschbarkeit =
  | { loeschbar: true }
  | { loeschbar: false; grund: string; kannDeaktivieren: boolean };
