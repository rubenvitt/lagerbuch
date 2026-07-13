/**
 * Landeziel eines eingelösten Zugangs-Codes. Ein Code führt entweder direkt zu einem Fahrzeug
 * (Fahrzeug-Check, vorausgewählt) oder zu einem Material im Handlager (Artikel-Detail). Ohne Ziel
 * landet der Helfer auf der allgemeinen Artikel-Liste.
 *
 * Rückgabe ist ein lokaler Pfad (startet mit "/") und ist damit kompatibel mit sanitizeReturnTo.
 */
export function tokenZielPfad(zielTyp: string | null | undefined, zielId: string | null | undefined): string {
  if (zielTyp === "artikel" && zielId) return `/a/${zielId}`;
  if (zielTyp === "fahrzeug" && zielId) return `/helfer/check?fz=${zielId}`;
  return "/helfer";
}
