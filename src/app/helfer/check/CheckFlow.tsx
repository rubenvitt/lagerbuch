"use client";
import { useState, useTransition } from "react";
import { Check, AlertTriangle, ArrowRight, PackageCheck, PackageSearch } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { checkAbschluss } from "@/actions/check";

type Pos = {
  id: string; fachLabel: string; artikelId: string; artikelName: string; einheit: string;
  handlagerFach: string; soll: number; fahrzeugBestand: number; handlagerBestand: number;
};
type Fahrzeug = { id: string; name: string; kennung: string | null };

// Zwei-Schritt-Kopf: zeigt jederzeit, wo im Check man steht (Führung & Klarheit).
function Schritte({ phase }: { phase: "zaehlen" | "nachfuellen" }) {
  return (
    <div className="checksteps">
      <div className={`stp ${phase === "zaehlen" ? "on" : "done"}`}>
        <span className="no">{phase === "zaehlen" ? "1" : <Check size={13} />}</span> Zählen
      </div>
      <div className={`stp ${phase === "nachfuellen" ? "on" : ""}`}>
        <span className="no">2</span> Nachfüllen
      </div>
    </div>
  );
}

export function CheckFlow({ fahrzeuge, soll }: { fahrzeuge: Fahrzeug[]; soll: Record<string, Pos[]> }) {
  const [vehId, setVehId] = useState<string | null>(fahrzeuge.length === 1 ? fahrzeuge[0].id : null);
  const [phase, setPhase] = useState<"zaehlen" | "nachfuellen">("zaehlen");
  const [ist, setIst] = useState<Record<string, number>>({});
  const [nachfuell, setNachfuell] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ nachgefuellt: number; offen: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (fahrzeuge.length === 0) return <div className="card cardpad">Keine Fahrzeuge angelegt. Die Verwaltung muss zuerst ein Fahrzeug + Soll pflegen.</div>;

  if (!vehId) return (
    <>
      <div className="screenhead">Fahrzeug wählen</div>
      <div className="card">
        {fahrzeuge.map((f) => (
          <button className="row" key={f.id} onClick={() => setVehId(f.id)} style={{ width: "100%", textAlign: "left", background: "none", border: 0 }}>
            <div className="rowmain"><div className="rowname">{f.name}</div>{f.kennung && <div className="rowmeta"><small>{f.kennung}</small></div>}</div>
            <ArrowRight size={17} style={{ color: "var(--stahl)", flex: "none" }} />
          </button>
        ))}
      </div>
    </>
  );

  const veh = fahrzeuge.find((f) => f.id === vehId)!;
  const positionen = soll[vehId] ?? [];
  const faecher = [...new Set(positionen.map((p) => p.fachLabel))];
  // Default = Soll ("voll annehmen, Gezähltes runterkorrigieren"). Der recorded Fahrzeugbestand
  // wird bewusst NICHT als Per-Position-Default genutzt: er ist pro Artikel (nicht pro Fach), und
  // derselbe Artikel in mehreren Fächern würde sich sonst vervielfachen.
  const istWert = (p: Pos) => ist[p.id] ?? p.soll;

  if (result) {
    const alles = result.offen === 0;
    return (
      <>
        <div className="screenhead">{veh.name} · Fertig</div>
        <div className="card cardpad" style={{ borderLeft: `4px solid var(--${alles ? "ok" : "gelb"})` }}>
          <div className="rowname" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 16 }}>
            <Check size={18} style={{ color: `var(--${alles ? "ok" : "gelb"})` }} /> Check abgeschlossen
          </div>
          <div className="rowmeta" style={{ marginTop: 9 }}>
            <span className="chip chip-ok">{result.nachgefuellt} aus Handlager geholt</span>
            {result.offen > 0 && <span className="chip chip-rot"><AlertTriangle size={11} /> {result.offen} fehlt weiterhin</span>}
          </div>
          {result.offen > 0 && (
            <small style={{ color: "var(--stahl)", display: "block", marginTop: 8 }}>
              Das Handlager hatte nicht genug – bitte der Verwaltung melden. {result.offen} Teile fehlen weiterhin auf dem Fahrzeug.
            </small>
          )}
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => { setResult(null); setPhase("zaehlen"); setIst({}); setNachfuell({}); setVehId(fahrzeuge.length === 1 ? vehId : null); }}>Weiterer Check</button>
      </>
    );
  }

  // ——— Schritt 1: Zählen ———
  if (phase === "zaehlen") {
    const unterSoll = positionen.filter((p) => istWert(p) < p.soll).length;
    const zurNachfuellung = () => {
      // Greedy je Artikel: die Handlager-Verfügbarkeit über die Positionen (Anzeige-Reihenfolge)
      // verteilen, damit der Vorschlag nicht mehr verspricht, als der Handlager hergibt.
      const remaining = new Map<string, number>();
      for (const p of positionen) if (!remaining.has(p.artikelId)) remaining.set(p.artikelId, p.handlagerBestand);
      const nf: Record<string, number> = {};
      for (const p of positionen) {
        const luecke = Math.max(0, p.soll - istWert(p));
        const rem = remaining.get(p.artikelId) ?? 0;
        const nimm = Math.min(luecke, rem);
        nf[p.id] = nimm;
        remaining.set(p.artikelId, rem - nimm);
      }
      setNachfuell(nf);
      setErr(null);
      setPhase("nachfuellen");
    };
    return (
      <>
        <div className="screenhead">{veh.name}{veh.kennung ? ` · ${veh.kennung}` : ""}</div>
        <Schritte phase="zaehlen" />
        <div className="card cardpad" style={{ marginBottom: 4 }}>
          <div className="rowname" style={{ fontSize: 14 }}>Wie viel liegt wirklich im Fahrzeug?</div>
          <small style={{ color: "var(--stahl)" }}>Jede Position ist auf Soll vorbelegt – mit <b>−</b> runterzählen, was fehlt.</small>
        </div>
        {positionen.length === 0 && <div className="card cardpad">Kein Soll für dieses Fahrzeug definiert.</div>}
        {faecher.map((fach) => (
          <div key={fach}>
            <div className="fachhead">{fach}</div>
            <div className="card">
              {positionen.filter((p) => p.fachLabel === fach).map((p) => {
                const wert = istWert(p);
                const luecke = Math.max(0, p.soll - wert);
                const ueber = wert > p.soll;
                return (
                  <div className="row" key={p.id}>
                    <div className={`checkcircle ${luecke > 0 ? "fehl" : "done"}`}>{luecke > 0 ? <AlertTriangle size={14} /> : <Check size={16} />}</div>
                    <div className="rowmain">
                      <div className="rowname">{p.artikelName}</div>
                      <div className="rowmeta">
                        <small>Soll {p.soll} {p.einheit}</small>
                        {luecke > 0 && <span className="chip chip-rot">nachfüllen {luecke}</span>}
                        {ueber && <span className="chip chip-gelb">Überbestand {wert - p.soll}</span>}
                      </div>
                    </div>
                    {/* max großzügig über Soll: echter Überbestand muss zählbar sein, sonst
                        würde der Abgleich real vorhandene Teile still herauskorrigieren. */}
                    <Stepper sm noText wert={wert} min={0} max={9999} setWert={(vv) => setIst((s) => ({ ...s, [p.id]: vv }))} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {positionen.length > 0 && (
          <div className="summary">
            <div className="info">
              <b>{unterSoll === 0 ? "Alles auf Soll" : `${unterSoll} unter Soll`}</b>
              <div>{unterSoll === 0 ? "Nichts nachzufüllen" : "Weiter zur Nachfüllung aus dem Handlager"}</div>
            </div>
            <button className="go" onClick={zurNachfuellung} style={{ display: "flex", alignItems: "center", gap: 6 }}>Weiter <ArrowRight size={16} /></button>
          </div>
        )}
      </>
    );
  }

  // ——— Schritt 2: Nachfüllen aus dem Handlager (bestätigen) ———
  const nfWert = (p: Pos) => nachfuell[p.id] ?? 0;
  // Handlager-Knappheit je Artikel: reicht der Bestand für die Summe aller Nachfüll-Positionen?
  const knappheit = new Map<string, { verfuegbar: number; gewuenscht: number }>();
  for (const p of positionen) {
    const e = knappheit.get(p.artikelId) ?? { verfuegbar: p.handlagerBestand, gewuenscht: 0 };
    e.gewuenscht += nfWert(p);
    knappheit.set(p.artikelId, e);
  }
  const nachfuellPositionen = positionen.filter((p) => Math.max(0, p.soll - istWert(p)) > 0);
  const summeNachfuell = positionen.reduce((s, p) => s + nfWert(p), 0);

  const abschluss = () => {
    setErr(null);
    start(async () => {
      try {
        const r = await checkAbschluss({
          fahrzeugId: vehId,
          positionen: positionen.map((p) => ({ sollPositionId: p.id, ist: istWert(p), nachfuellMenge: nfWert(p) })),
        });
        setResult({ nachgefuellt: r.nachgefuellt, offen: r.offen });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Fehler beim Abschließen – bitte erneut versuchen");
      }
    });
  };

  return (
    <>
      <div className="screenhead">{veh.name}</div>
      <Schritte phase="nachfuellen" />
      <button className="btn btn-ghost" onClick={() => setPhase("zaehlen")} style={{ marginBottom: 10 }}>← Zurück zum Zählen</button>
      {nachfuellPositionen.length === 0 ? (
        <div className="card cardpad">Nichts nachzufüllen – alle Positionen sind auf Soll. Du kannst den Check direkt abschließen.</div>
      ) : (
        <>
          <div className="card cardpad" style={{ marginBottom: 4, display: "flex", gap: 9, alignItems: "flex-start" }}>
            <PackageSearch size={18} style={{ color: "var(--rot)", flex: "none", marginTop: 1 }} />
            <div>
              <div className="rowname" style={{ fontSize: 14 }}>Aus dem Handlager aufs Fahrzeug legen</div>
              <small style={{ color: "var(--stahl)" }}>Hol die Teile aus dem angegebenen Handlager-Fach und stell mit <b>+/−</b> ein, wie viele du <b>wirklich</b> geholt hast.</small>
            </div>
          </div>
          <div className="card">
            {nachfuellPositionen.map((p) => {
              const luecke = Math.max(0, p.soll - istWert(p));
              return (
                <div className="nfitem" key={p.id}>
                  <div className="rowmain">
                    <div className="rowname">{p.artikelName}</div>
                    <div className="rowmeta">
                      <span className="fach">{p.handlagerFach}</span>
                      <small>Lücke {luecke} · im Handlager {p.handlagerBestand}</small>
                    </div>
                  </div>
                  <div className="nfget">
                    <Stepper sm noText wert={nfWert(p)} min={0} max={luecke} setWert={(vv) => setNachfuell((s) => ({ ...s, [p.id]: vv }))} />
                    <small>geholt</small>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {[...knappheit.entries()].filter(([, e]) => e.gewuenscht > e.verfuegbar).length > 0 && (
        <div className="card cardpad">
          <div className="chip chip-gelb" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <AlertTriangle size={13} /> Handlager reicht nicht für alle Positionen – es wird nur gebucht, was verfügbar ist.
          </div>
        </div>
      )}
      {err && <div className="card cardpad"><div className="gateerr">{err}</div></div>}
      <div className="summary">
        <div className="info">
          <b>{summeNachfuell} Teile aufs Fahrzeug</b>
          <div>Bestätigen bucht Handlager → {veh.name}</div>
        </div>
        <button className="go" disabled={pending} onClick={abschluss} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PackageCheck size={16} /> Gelegt & abschließen
        </button>
      </div>
    </>
  );
}
