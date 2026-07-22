"use client";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { geraetSpeichern } from "@/actions/bz";
import type { bzGeraete } from "@/db/schema";
import { Combobox } from "@/components/Combobox";

type Geraet = typeof bzGeraete.$inferSelect;
type LagerortOption = { id: string; name: string; typ: "lager" | "fahrzeug" };

const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));

export function ReferenzEditor({ geraet, lagerorte }: { geraet: Geraet; lagerorte: LagerortOption[] }) {
  const [name, setName] = useState(geraet.name);
  const [barcode, setBarcode] = useState(geraet.barcode ?? "");
  const [lagerortId, setLagerortId] = useState(geraet.lagerortId);
  const [streifenLot, setStreifenLot] = useState(geraet.streifenLot ?? "");
  const [l1Label, setL1Label] = useState(geraet.level1Label ?? "");
  const [l1Min, setL1Min] = useState(geraet.level1Min?.toString() ?? "");
  const [l1Max, setL1Max] = useState(geraet.level1Max?.toString() ?? "");
  const [l2Label, setL2Label] = useState(geraet.level2Label ?? "");
  const [l2Min, setL2Min] = useState(geraet.level2Min?.toString() ?? "");
  const [l2Max, setL2Max] = useState(geraet.level2Max?.toString() ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function speichern() {
    setErr(null);
    setMsg(null);
    if (!name.trim()) { setErr("Name erforderlich"); return; }
    start(async () => {
      try {
        await geraetSpeichern({
          id: geraet.id,
          name: name.trim(),
          barcode: barcode.trim() || undefined,
          lagerortId,
          streifenLot: streifenLot.trim() || undefined,
          level1Label: l1Label.trim() || undefined,
          level1Min: numOrUndef(l1Min),
          level1Max: numOrUndef(l1Max),
          level2Label: l2Label.trim() || undefined,
          level2Min: numOrUndef(l2Min),
          level2Max: numOrUndef(l2Max),
        });
        setMsg("Gespeichert");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Fehler beim Speichern");
      }
    });
  }

  return (
    <div className="card cardpad" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 160 }}>
          <span className="label">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <span className="label">Barcode</span>
          <input className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <span className="label">Lagerort</span>
          <Combobox
            options={lagerorte.map((l) => ({ value: l.id, label: l.name }))}
            value={lagerortId}
            onChange={setLagerortId}
            placeholder="Lagerort wählen…"
            emptyText="Kein Lagerort gefunden"
            ariaLabel="Lagerort"
          />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <span className="label">Streifen-Lot</span>
          <input className="input" value={streifenLot} onChange={(e) => setStreifenLot(e.target.value)} />
        </div>
      </div>

      {([
        { n: "Level 1", label: l1Label, setLabel: setL1Label, min: l1Min, setMin: setL1Min, max: l1Max, setMax: setL1Max },
        { n: "Level 2", label: l2Label, setLabel: setL2Label, min: l2Min, setMin: setL2Min, max: l2Max, setMax: setL2Max },
      ] as const).map((lv) => (
        <div key={lv.n} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 2, minWidth: 140 }}>
            <span className="label">{lv.n} Bezeichnung</span>
            <input className="input" placeholder="z. B. Level 3" value={lv.label} onChange={(e) => lv.setLabel(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 90 }}>
            <span className="label">Min</span>
            <input className="input" inputMode="numeric" value={lv.min} onChange={(e) => lv.setMin(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 90 }}>
            <span className="label">Max</span>
            <input className="input" inputMode="numeric" value={lv.max} onChange={(e) => lv.setMax(e.target.value)} />
          </div>
        </div>
      ))}

      {err && <div className="gateerr">{err}</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn btn-rot" disabled={pending || !name.trim()} onClick={speichern}>Speichern</button>
        {msg && <span className="chip chip-ok" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={13} /> {msg}</span>}
      </div>
    </div>
  );
}
