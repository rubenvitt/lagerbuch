export type ChargeRest = { chargeId: string; verfall: string; rest: number };

export function fefoVerteilung(
  chargen: ChargeRest[],
  menge: number,
): { chargeId: string; menge: number }[] {
  let rest = Math.max(0, menge);
  const sortiert = [...chargen]
    .filter((c) => c.rest > 0)
    .sort((a, b) => a.verfall.localeCompare(b.verfall));
  const result: { chargeId: string; menge: number }[] = [];
  for (const c of sortiert) {
    if (rest <= 0) break;
    const nimm = Math.min(c.rest, rest);
    rest -= nimm;
    result.push({ chargeId: c.chargeId, menge: nimm });
  }
  return result;
}
