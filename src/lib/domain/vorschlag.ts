export function braucht(bestand: number, mindestbestand: number): boolean {
  return bestand < mindestbestand;
}

// Nachbestellen heißt schlicht: bis zum Mindestbestand (Soll) auffüllen. Kein Faktor/Puffer –
// bestellt wird genau die Lücke bis zum Soll (mindestbestand − bestand), nie negativ.
export function vorschlagsmenge(
  bestand: number,
  mindestbestand: number,
): number {
  return Math.max(0, mindestbestand - bestand);
}
