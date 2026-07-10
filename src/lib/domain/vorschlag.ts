export function braucht(bestand: number, mindestbestand: number): boolean {
  return bestand < mindestbestand;
}

export function vorschlagsmenge(
  bestand: number,
  mindestbestand: number,
  faktor: number,
): number {
  if (!braucht(bestand, mindestbestand)) return 0;
  return Math.max(0, faktor * mindestbestand - bestand);
}
