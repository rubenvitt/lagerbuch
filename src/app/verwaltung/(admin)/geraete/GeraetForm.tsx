"use client";
import { useState, useTransition } from "react";
import { Check, HeartPulse, Package } from "lucide-react";
import { geraetSpeichern } from "@/actions/geraete";
import { Combobox } from "@/components/Combobox";

export type GeraetInitial = {
  id: string;
  typ: "medizin" | "objekt";
  name: string;
  barcode: string | null;
  lagerortId: string;
  anmerkung: string | null;
  mtkFaellig: string | null;
  beschreibung: string | null;
  ablaufdatum: string | null;
};
type LagerortOption = { id: string; name: string; typ: "lager" | "fahrzeug" };

/**
 * Anlage- UND Bearbeiten-Formular für ein Gerät (ein Bauteil für beide, weil die Feldmenge
 * typ-abhängig und größer ist als bei BZ). `initial` gesetzt = Bearbeiten (Upsert per id),
 * sonst Anlage. `onSaved` schließt z. B. den Drawer nach erfolgreicher Anlage.
 */
export function GeraetForm({
  lagerorte,
  initial,
  onSaved,
}: {
  lagerorte: LagerortOption[];
  initial?: GeraetInitial;
  onSaved?: () => void;
}) {
  const [typ, setTyp] = useState<"medizin" | "objekt">(initial?.typ ?? "medizin");
  const [name, setName] = useState(initial?.name ?? "");
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [lagerortId, setLagerortId] = useState(initial?.lagerortId ?? lagerorte[0]?.id ?? "");
  const [anmerkung, setAnmerkung] = useState(initial?.anmerkung ?? "");
  const [mtkFaellig, setMtkFaellig] = useState(initial?.mtkFaellig ?? "");
  const [beschreibung, setBeschreibung] = useState(initial?.beschreibung ?? "");
  const [ablaufdatum, setAblaufdatum] = useState(initial?.ablaufdatum ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function speichern() {
    setErr(null);
    setMsg(null);
    if (!name.trim() || !lagerortId) return;
    start(async () => {
      try {
        await geraetSpeichern({
          id: initial?.id,
          typ,
          name: name.trim(),
          barcode: barcode.trim() || undefined,
          lagerortId,
          anmerkung: anmerkung.trim() || undefined,
          mtkFaellig: typ === "medizin" ? mtkFaellig || undefined : undefined,
          beschreibung: typ === "objekt" ? beschreibung.trim() || undefined : undefined,
          ablaufdatum: typ === "objekt" ? ablaufdatum || undefined : undefined,
        });
        if (initial) {
          setMsg("Gespeichert");
        } else {
          setTyp("medizin"); setName(""); setBarcode(""); setAnmerkung("");
          setMtkFaellig(""); setBeschreibung(""); setAblaufdatum("");
        }
        onSaved?.();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
      }
    });
  }

  return (
    <div className="card cardpad" style={{ display: "grid", gap: 12 }}>
      <div className="segmented" role="tablist" style={{ display: "flex", gap: 8 }}>
        {([
          { v: "medizin", label: "Medizinisches Gerät", Icon: HeartPulse },
          { v: "objekt", label: "Objekt", Icon: Package },
        ] as const).map(({ v, label, Icon }) => (
          <button
            key={v}
            type="button"
            className={`btn slim ${typ === v ? "btn-rot" : "btn-ghost"}`}
            aria-pressed={typ === v}
            onClick={() => setTyp(v)}
            style={{ flex: 1 }}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 160 }}>
          <span className="label">Bezeichnung</span>
          <input className="input" placeholder="z. B. Corpuls C3" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <span className="label">Barcode (optional)</span>
          <input className="input" placeholder="Barcode / Seriennummer" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <span className="label">Standort</span>
          <Combobox
            options={lagerorte.map((l) => ({ value: l.id, label: l.name }))}
            value={lagerortId}
            onChange={setLagerortId}
            placeholder="Standort wählen…"
            emptyText="Kein Standort gefunden"
            ariaLabel="Standort"
          />
        </div>
      </div>

      {typ === "medizin" ? (
        <div style={{ maxWidth: 220 }}>
          <span className="label">Nächste MTK (optional)</span>
          <input className="input" type="date" value={mtkFaellig} onChange={(e) => setMtkFaellig(e.target.value)} />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <span className="label">Beschreibung (optional)</span>
            <input className="input" placeholder="z. B. Spineboard mit Gurtspinne" value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <span className="label">Ablaufdatum (optional)</span>
            <input className="input" type="date" value={ablaufdatum} onChange={(e) => setAblaufdatum(e.target.value)} />
          </div>
        </div>
      )}

      <div>
        <span className="label">Anmerkung (optional)</span>
        <input className="input" placeholder="Freitext" value={anmerkung} onChange={(e) => setAnmerkung(e.target.value)} />
      </div>

      {err && <div className="gateerr">{err}</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn btn-rot" disabled={pending || !name.trim() || !lagerortId} onClick={speichern}>
          {initial ? "Speichern" : "Gerät anlegen"}
        </button>
        {msg && <span className="chip chip-ok" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={13} /> {msg}</span>}
      </div>
    </div>
  );
}
