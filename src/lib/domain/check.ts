// Fehlmengen einer Ist-Erfassung gegen Soll: fehlt = max(0, soll - ist), nur > 0.
// Generisch, damit Aufrufer Positions-Identitaet (sollPositionId, artikelId) durchreichen koennen.
export function fehlmengen<T extends { soll: number; ist: number }>(positionen: T[]): (T & { fehlt: number })[] {
  return positionen.map((p) => ({ ...p, fehlt: Math.max(0, p.soll - p.ist) })).filter((p) => p.fehlt > 0);
}
