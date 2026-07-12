export function bestand(rows: { menge: number }[]): number {
  return rows.reduce((sum, r) => sum + r.menge, 0);
}

export function bestandProCharge(
  rows: { chargeId: string; menge: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.chargeId, (m.get(r.chargeId) ?? 0) + r.menge);
  return m;
}

// Bestand EINES Lagerorts. Sobald Fahrzeuge eigene Buchungen tragen, darf keine
// Handlager-Ansicht mehr blind über alle Lagerorte summieren — hier wird explizit gefiltert.
export function bestandProLagerort(
  rows: { lagerortId: string; menge: number }[],
  lagerortId: string,
): number {
  return rows.reduce((sum, r) => (r.lagerortId === lagerortId ? sum + r.menge : sum), 0);
}

// Rest je Charge, aber NUR für einen Lagerort. Kern-Fix gegen Phantombestand:
// FEFO/Aussonderung/Inventur dürfen nicht die gleiche chargeId aus einem anderen
// Lagerort mitzählen (z. B. dieselbe Charge liegt teils im Handlager, teils im RTW).
export function bestandProLagerortUndCharge(
  rows: { lagerortId: string; chargeId: string; menge: number }[],
  lagerortId: string,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.lagerortId !== lagerortId) continue;
    m.set(r.chargeId, (m.get(r.chargeId) ?? 0) + r.menge);
  }
  return m;
}
