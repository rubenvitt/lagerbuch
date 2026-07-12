"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Minus, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Plakette } from "@/components/Plakette";
import { Stepper } from "@/components/Stepper";
import { updateArtikel } from "@/actions/artikel";
import { bucheZugang, bucheEntnahme } from "@/actions/buchung";
import { getDetail, type ArtikelDetailResult } from "@/actions/detail";
import { chipTone, fmtTs, fmtVerfall, typLabel } from "@/lib/format";

const EINHEITEN = ["Stk.", "Pkg.", "Fl.", "Box"];
const NEUE_CHARGE = "__neu__";
const MINDEST_DEBOUNCE_MS = 400;

export function ArtikelDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  // undefined = loading, null = not found (e.g. deleted concurrently), object = loaded
  const [detail, setDetail] = useState<ArtikelDetailResult | undefined>(undefined);

  // Local, instantly-editable mirrors of server fields (see onMindestChange etc. below) so
  // Stepper clicks / keystrokes never read back a stale value while a commit is in flight.
  const [mindest, setMindest] = useState(0);
  const [fach, setFach] = useState("");
  const [einheit, setEinheit] = useState<string>(EINHEITEN[0]);

  const [menge, setMenge] = useState(1);
  const [entnahmeZiel, setEntnahmeZiel] = useState<string>(""); // "" = Handlager/Verbrauch
  const [chargeAuswahl, setChargeAuswahl] = useState<string>(NEUE_CHARGE);
  const [chargenNr, setChargenNr] = useState("");
  const [verfall, setVerfall] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mindestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const d = await getDetail(id);
    setDetail(d);
    if (d) {
      setMindest(d.artikel.mindestbestand);
      setFach(d.artikel.fach);
      setEinheit(d.artikel.einheit);
    }
    return d;
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    return () => {
      if (mindestTimer.current) clearTimeout(mindestTimer.current);
    };
  }, []);

  async function afterMutation() {
    await reload();
    router.refresh();
  }

  async function commitField(patch: Partial<{ fach: string; einheit: string; mindestbestand: number }>) {
    setBusy(true);
    setError(null);
    try {
      await updateArtikel(id, patch);
      await afterMutation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  function onMindestChange(v: number) {
    setMindest(v);
    if (mindestTimer.current) clearTimeout(mindestTimer.current);
    mindestTimer.current = setTimeout(() => {
      void commitField({ mindestbestand: v });
    }, MINDEST_DEBOUNCE_MS);
  }

  function onEinheitChange(v: string) {
    setEinheit(v);
    void commitField({ einheit: v });
  }

  function onFachBlur() {
    const trimmed = fach.trim();
    if (trimmed && trimmed !== detail?.artikel.fach) void commitField({ fach: trimmed });
  }

  async function onEntnahme() {
    setBusy(true);
    setError(null);
    try {
      await bucheEntnahme({ artikelId: id, menge, zielLagerortId: entnahmeZiel || undefined });
      setMenge(1);
      await afterMutation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Entnahme fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function onZugang() {
    if (chargeAuswahl === NEUE_CHARGE && (!chargenNr.trim() || !verfall)) {
      setError("Chargen-Nr. und Verfall angeben");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (chargeAuswahl === NEUE_CHARGE) {
        await bucheZugang({ artikelId: id, menge, neueCharge: { chargenNr: chargenNr.trim(), verfall } });
        setChargenNr("");
        setVerfall("");
      } else {
        await bucheZugang({ artikelId: id, menge, chargeId: chargeAuswahl });
      }
      setMenge(1);
      await afterMutation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zugang fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  if (detail === undefined) {
    return (
      <div className="drawerdim" onClick={onClose}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
          <div className="sheettitle">
            <h2>Lädt …</h2>
            <button aria-label="Schließen" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="drawerdim" onClick={onClose}>
        <div className="drawer" onClick={(e) => e.stopPropagation()}>
          <div className="sheettitle">
            <h2>Nicht gefunden</h2>
            <button aria-label="Schließen" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
          <div className="empty">Dieser Artikel existiert nicht mehr.</div>
        </div>
      </div>
    );
  }

  const unterMindest = detail.bestand < mindest;
  const worstAblauf = detail.chargen.find((c) => c.ampel !== "gruen") ?? null;

  return (
    <div className="drawerdim" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="sheettitle">
          <h2>{detail.artikel.name}</h2>
          <button aria-label="Schließen" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="rowmeta" style={{ margin: "0 0 12px" }}>
          {!unterMindest && !worstAblauf && <span className="chip chip-ok">ok</span>}
          {unterMindest && (
            <span className="chip chip-rot">
              <AlertTriangle size={11} /> unter Mindestbestand
            </span>
          )}
          {worstAblauf && <span className={`chip chip-${chipTone(worstAblauf.ampel)}`}>Charge {worstAblauf.text}</span>}
        </div>

        {error && (
          <div style={{ color: "var(--rot)", fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{error}</div>
        )}

        <div className="card cardpad grid2">
          <div>
            <span className="label">Bestand</span>
            <div style={{ font: "700 30px var(--display)" }}>
              {detail.bestand} <span style={{ fontSize: 14 }}>{detail.artikel.einheit}</span>
            </div>
          </div>
          <div>
            <span className="label">Mindestbestand</span>
            <Stepper sm min={0} wert={mindest} setWert={onMindestChange} />
          </div>
          <div>
            <span className="label">Fach im Handlager</span>
            <input
              className="input"
              value={fach}
              onChange={(e) => setFach(e.target.value.toUpperCase())}
              onBlur={onFachBlur}
            />
          </div>
          <div>
            <span className="label">Einheit</span>
            <select className="input" value={einheit} onChange={(e) => onEinheitChange(e.target.value)}>
              {EINHEITEN.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="card">
          <div className="cardtitle">Buchung</div>
          <div className="cardpad" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13.5, color: "var(--stahl)" }}>Menge</span>
              <Stepper wert={menge} setWert={setMenge} />
            </div>
            {detail.fahrzeuge.length > 0 && (
              <div>
                <span className="label">Ziel</span>
                <select className="input" value={entnahmeZiel} onChange={(e) => setEntnahmeZiel(e.target.value)}>
                  <option value="">Handlager (Verbrauch)</option>
                  {detail.fahrzeuge.map((f) => (
                    <option key={f.id} value={f.id}>Umlagern → {f.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button className="btn btn-rot" disabled={busy || detail.bestand === 0} onClick={onEntnahme}>
              <Minus size={15} /> {entnahmeZiel ? "Umlagern" : "Entnahme"}
            </button>

            <div style={{ borderTop: "1px solid var(--linie)", paddingTop: 10, display: "grid", gap: 8 }}>
              <span className="label">Zugang · Charge</span>
              <select className="input" value={chargeAuswahl} onChange={(e) => setChargeAuswahl(e.target.value)}>
                <option value={NEUE_CHARGE}>+ Neue Charge</option>
                {detail.chargen.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.chargenNr} · {fmtVerfall(c.verfall)} · Rest {c.rest}
                  </option>
                ))}
              </select>
              {chargeAuswahl === NEUE_CHARGE && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <span className="label">Chargen-Nr.</span>
                    <input
                      className="input"
                      value={chargenNr}
                      onChange={(e) => setChargenNr(e.target.value)}
                      placeholder="z. B. 2507-014"
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <span className="label">Verfall</span>
                    <input className="input" type="month" value={verfall} onChange={(e) => setVerfall(e.target.value)} />
                  </div>
                </div>
              )}
              <button className="btn btn-ghost" disabled={busy} onClick={onZugang}>
                <Plus size={15} /> Zugang
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardtitle">Chargen · älteste zuerst (FEFO)</div>
          {detail.chargen.length === 0 && <div className="empty">Keine Chargen im Bestand.</div>}
          {detail.chargen.map((c) => (
            <div className="row" key={c.id}>
              <Plakette verfall={c.verfall} ampel={c.ampel} />
              <div className="rowmain">
                <div style={{ font: "600 12.5px var(--mono)" }}>Charge {c.chargenNr}</div>
                <div className="rowmeta">
                  <span className={`chip chip-${chipTone(c.ampel)}`}>{c.text}</span>
                </div>
              </div>
              <div className="bignum" style={{ fontSize: 19 }}>
                {c.rest}
                <small>{detail.artikel.einheit}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="card journal">
          <div className="cardtitle">Letzte Buchungen</div>
          {detail.buchungen.length === 0 && <div className="empty">Noch keine Buchungen.</div>}
          {detail.buchungen.map((b, i) => {
            const label = typLabel(b.typ);
            return (
              <div className="row" key={`${b.ts.getTime()}_${i}`}>
                <span className="jts">{fmtTs(b.ts)}</span>
                <span style={{ flex: 1 }}>{b.kommentar ? `${label} · ${b.kommentar}` : label}</span>
                <span className={`jdelta ${b.menge < 0 ? "minus" : "plus"}`}>
                  {b.menge > 0 ? "+" : ""}
                  {b.menge}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
