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
