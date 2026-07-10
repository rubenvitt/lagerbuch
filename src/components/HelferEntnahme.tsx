"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, Check, Minus } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { Plakette } from "@/components/Plakette";
import { bucheEntnahmeHelfer } from "@/actions/buchung";
import { chipTone } from "@/lib/format";
import type { Ampel } from "@/lib/domain/verfall";

export type DetailData = {
  id: string; name: string; einheit: string; fach: string; bestand: number;
  chargen: { id: string; chargenNr: string; verfall: string; rest: number; ampel: Ampel; text: string }[];
};

export function HelferEntnahme({ detail }: { detail: DetailData }) {
  const [menge, setMenge] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const bestand = detail.bestand;

  function buchen() {
    const m = Math.min(menge, bestand);
    if (m <= 0) return;
    start(async () => {
      const { gebucht } = await bucheEntnahmeHelfer({ artikelId: detail.id, menge: m });
      setMsg(`Entnahme gebucht: ${gebucht} × ${detail.name}`);
      setMenge(1);
    });
  }

  return (
    <>
      <Link className="filter" href="/helfer" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 12 }}>
        <ChevronLeft size={15} /> Zurück
      </Link>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: "0 2px 6px" }}>
        <h1 style={{ font: "700 24px var(--display)", lineHeight: 1.12, flex: 1 }}>{detail.name}</h1>
        <span className="fach" style={{ marginTop: 6 }}>{detail.fach}</span>
      </div>
      <div className="card cardpad">
        <div style={{ fontSize: 12, color: "var(--stahl)", fontWeight: 600, letterSpacing: ".04em" }}>BESTAND HANDLAGER</div>
        <div style={{ font: "700 36px var(--display)", lineHeight: 1.05 }}>{bestand} <span style={{ fontSize: 16 }}>{detail.einheit}</span></div>
      </div>
      <div className="card">
        <div className="cardtitle">Entnahme</div>
        <div className="cardpad" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13.5, color: "var(--stahl)", fontWeight: 500 }}>Menge</span>
            <Stepper wert={menge} setWert={setMenge} max={Math.max(bestand, 1)} />
          </div>
          <button className="btn btn-rot" disabled={bestand === 0 || pending} onClick={buchen}>
            <Minus size={16} /> Entnahme buchen
          </button>
          {msg && <div className="chip chip-ok" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={14} /> {msg}</div>}
        </div>
      </div>
      <div className="card">
        <div className="cardtitle">Nächste Charge zuerst (FEFO)</div>
        {detail.chargen.map((c) => (
          <div className="row" key={c.id}>
            <Plakette verfall={c.verfall} ampel={c.ampel} />
            <div className="rowmain">
              <div style={{ font: "600 12.5px var(--mono)" }}>Charge {c.chargenNr}</div>
              <div className="rowmeta"><span className={`chip chip-${chipTone(c.ampel)}`}>{c.text}</span></div>
            </div>
            <div className="bignum" style={{ fontSize: 20 }}>{c.rest}<small>{detail.einheit}</small></div>
          </div>
        ))}
      </div>
    </>
  );
}
