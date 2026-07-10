"use client";

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
  return (
    <div className={`stepper${sm ? " sm" : ""}`}>
      <button className="stepbtn" aria-label="Menge verringern" onClick={() => setWert(Math.max(min, wert - 1))}>
        <Minus size={sm ? 14 : 18} />
      </button>
      <div className="stepval" aria-live="polite">
        {wert}
      </div>
      <button className="stepbtn" aria-label="Menge erhöhen" onClick={() => setWert(Math.min(max, wert + 1))}>
        <Plus size={sm ? 14 : 18} />
      </button>
    </div>
  );
}
