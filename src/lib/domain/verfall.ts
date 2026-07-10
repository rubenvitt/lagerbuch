export type Ampel = "rot" | "gelb" | "gruen";

export function verfallStatus(
  verfall: string,
  opts: { kritisch: number; faellig: number },
  now: Date,
): { ampel: Ampel; tage: number; abgelaufen: boolean } {
  const [y, m] = verfall.split("-").map(Number);
  // Day 0 of the next month = last day of this month; end-of-day.
  const ende = new Date(y, m, 0, 23, 59, 59, 999);
  const tage = Math.ceil((ende.getTime() - now.getTime()) / 86_400_000);
  const abgelaufen = ende.getTime() < now.getTime();
  let ampel: Ampel;
  if (tage <= opts.kritisch) ampel = "rot";
  else if (tage <= opts.faellig) ampel = "gelb";
  else ampel = "gruen";
  return { ampel, tage, abgelaufen };
}
