"use client";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { kontrolleErfassen } from "@/actions/bz";
import { imBereich } from "@/lib/domain/bz";

type LevelCfg = { label: string | null; min: number | null; max: number | null };

function LevelInput({ cfg, wert, setWert, nr }: { cfg: LevelCfg; wert: string; setWert: (v: string) => void; nr: number }) {
  const konfiguriert = cfg.min !== null && cfg.max !== null;
  const num = wert.trim() === "" ? null : Number(wert);
  const status = imBereich(num, cfg.min, cfg.max);
  return (
    <div style={{ flex: 1, minWidth: 150 }}>
      <span className="label">{cfg.label || `Level ${nr}`}{konfiguriert ? ` (${cfg.min}–${cfg.max})` : ""}</span>
      <input className="input" inputMode="numeric" placeholder="Messwert" value={wert} onChange={(e) => setWert(e.target.value.replace(/\D/g, ""))} />
      {num !== null && status !== null && (
        <span className={`chip chip-${status ? "ok" : "rot"}`} style={{ marginTop: 6, display: "inline-block" }}>
          {status ? "im Bereich" : "außerhalb"}
        </span>
      )}
    </div>
  );
}

export function KontrolleForm({ geraetId, level1, level2 }: { geraetId: string; level1: LevelCfg; level2: LevelCfg }) {
  const [l1, setL1] = useState("");
  const [l2, setL2] = useState("");
  const [kompresse, setKompresse] = useState("");
  const [sticks, setSticks] = useState(0);
  const [lanzetten, setLanzetten] = useState(0);
  const [batterie, setBatterie] = useState(false);
  const [kommentar, setKommentar] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));

  function erfassen() {
    setErr(null);
    setMsg(null);
    start(async () => {
      try {
        const r = await kontrolleErfassen({
          geraetId,
          level1Wert: numOrUndef(l1),
          level2Wert: numOrUndef(l2),
          kompresseVerfall: kompresse.trim() || undefined,
          sticks,
          lanzetten,
          batterieGewechselt: batterie,
          kommentar: kommentar.trim() || undefined,
        });
        setMsg(r.bestanden ? "Kontrolle erfasst – bestanden" : "Kontrolle erfasst – NICHT bestanden");
        setL1(""); setL2(""); setKompresse(""); setSticks(0); setLanzetten(0); setBatterie(false); setKommentar("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Fehler beim Erfassen");
      }
    });
  }

  return (
    <div className="card cardpad" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <LevelInput cfg={level1} wert={l1} setWert={setL1} nr={1} />
        <LevelInput cfg={level2} wert={l2} setWert={setL2} nr={2} />
        <div style={{ flex: 1, minWidth: 120 }}>
          <span className="label">Kompresse-Verfall</span>
          <input className="input" type="month" value={kompresse} onChange={(e) => setKompresse(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="label" style={{ margin: 0 }}>Sticks</span>
          <Stepper sm min={0} max={9999} wert={sticks} setWert={setSticks} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="label" style={{ margin: 0 }}>Lanzetten</span>
          <Stepper sm min={0} max={9999} wert={lanzetten} setWert={setLanzetten} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: "var(--tinte)" }}>
          <input type="checkbox" checked={batterie} onChange={(e) => setBatterie(e.target.checked)} /> Batterie gewechselt
        </label>
      </div>

      <input className="input" placeholder="Kommentar (optional)" value={kommentar} onChange={(e) => setKommentar(e.target.value)} />

      {err && <div className="gateerr">{err}</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn btn-rot" disabled={pending} onClick={erfassen}>Kontrolle erfassen</button>
        {msg && <span className="chip chip-ok" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={13} /> {msg}</span>}
      </div>
    </div>
  );
}
