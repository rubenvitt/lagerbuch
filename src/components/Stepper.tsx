"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

export function Stepper({
  wert,
  setWert,
  min = 1,
  max = 999,
  sm = false,
}: {
  wert: number;
  setWert: (wert: number) => void;
  min?: number;
  max?: number;
  sm?: boolean;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  // draft hält nur den Roh-Text WÄHREND der Direkteingabe; null = Feld spiegelt den wert-Prop.
  // So bleibt der Parent-Wert die Quelle der Wahrheit und Klicks/Tastatur lesen nie einen
  // veralteten Wert zurück (siehe ArtikelDrawer-Kommentar zu genau dieser Sensitivität).
  const [draft, setDraft] = useState<string | null>(null);
  const anzeige = draft ?? String(wert);

  function tippen(roh: string) {
    const nurZiffern = roh.replace(/\D/g, "");
    if (nurZiffern === "") {
      setDraft(""); // leere Eingabe erlauben (Löschen & neu tippen) – NICHT als 0 committen
      return;
    }
    const c = clamp(parseInt(nurZiffern, 10));
    setDraft(String(c)); // Anzeige = geklemmter Wert (kein Tippen über max/unter min)
    setWert(c);
  }

  function abschliessen() {
    setDraft(null); // zurück auf den wert-Prop; leeres/ungültiges Feld verwirft die Eingabe
  }

  return (
    <div className={`stepper${sm ? " sm" : ""}`}>
      <button className="stepbtn" aria-label="Menge verringern" onClick={() => { setDraft(null); setWert(clamp(wert - 1)); }}>
        <Minus size={sm ? 14 : 18} />
      </button>
      <input
        className="stepval"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Menge"
        value={anzeige}
        onChange={(e) => tippen(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={abschliessen}
      />
      <button className="stepbtn" aria-label="Menge erhöhen" onClick={() => { setDraft(null); setWert(clamp(wert + 1)); }}>
        <Plus size={sm ? 14 : 18} />
      </button>
    </div>
  );
}
