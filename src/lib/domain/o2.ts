import type { Ampel } from "@/lib/domain/verfall";

/** Ampel-Schwellen für den Füllstand in % vom Nennfülldruck. */
export const O2_AMPEL_GELB_PROZENT = 50; // < 50 % → gelb (mittel)
export const O2_AMPEL_ROT_PROZENT = 25; // < 25 % → rot (niedrig, Warnung)

/** Füllstand in Prozent (gerundet), 0 wenn nenndruck <= 0. Nicht > 100 geklemmt (Überfüllung sichtbar). */
export function fuellstandProzent(druckBar: number, nennfuelldruckBar: number): number {
  if (nennfuelldruckBar <= 0) return 0;
  return Math.round((druckBar / nennfuelldruckBar) * 100);
}

export type O2Status = { prozent: number; ampel: Ampel; niedrig: boolean };

/** Prozent + Ampel + Warnflag (niedrig = ampel rot). */
export function o2Status(druckBar: number, nennfuelldruckBar: number): O2Status {
  const prozent = fuellstandProzent(druckBar, nennfuelldruckBar);
  let ampel: Ampel;
  if (prozent < O2_AMPEL_ROT_PROZENT) ampel = "rot";
  else if (prozent < O2_AMPEL_GELB_PROZENT) ampel = "gelb";
  else ampel = "gruen";
  return { prozent, ampel, niedrig: ampel === "rot" };
}
