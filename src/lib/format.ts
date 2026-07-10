import type { Ampel } from "@/lib/domain/verfall";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function fmtVerfall(v: string): string {
  const [y, m] = v.split("-");
  return `${m}/${y.slice(2)}`;
}

export function fmtTs(ts: Date): string {
  return `${pad2(ts.getDate())}.${pad2(ts.getMonth() + 1)}. ${pad2(ts.getHours())}:${pad2(ts.getMinutes())}`;
}

/** Chip wording for a charge's verfall status, matching the mockup's tone→text mapping. */
export function chargeText(status: { ampel: Ampel; abgelaufen: boolean }, verfall: string): string {
  if (status.abgelaufen) return "abgelaufen";
  if (status.ampel === "rot") return `läuft ${fmtVerfall(verfall)} ab`;
  if (status.ampel === "gelb") return `fällig ${fmtVerfall(verfall)}`;
  return `bis ${fmtVerfall(verfall)}`;
}

/**
 * CSS chip-tone suffix for an Ampel value. The `.chip-*` classes in globals.css are named
 * "rot"/"gelb"/"ok" (ported from the mockup's tone naming), NOT "gruen" — so `gruen` must be
 * mapped to "ok" here rather than interpolated directly into `chip-${ampel}` (that would emit
 * an undefined `chip-gruen` class: padding/radius but no background/text color).
 */
export function chipTone(ampel: Ampel): "rot" | "gelb" | "ok" {
  return ampel === "gruen" ? "ok" : ampel;
}

const TYP_LABEL: Record<string, string> = {
  zugang: "Wareneingang",
  entnahme: "Entnahme",
  korrektur: "Korrektur",
};

/** German label for a Buchung's `typ`, matching the mockup's wording. */
export function typLabel(typ: string): string {
  return TYP_LABEL[typ] ?? typ;
}
