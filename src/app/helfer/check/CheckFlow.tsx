"use client";
import { useState, useTransition } from "react";
import { Check, AlertTriangle, ArrowRight, PackageCheck, PackageSearch, HeartPulse, Package } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { checkAbschluss } from "@/actions/check";

type Pos = {
  id: string; fachLabel: string; artikelId: string; artikelName: string; einheit: string;
  handlagerFach: string; soll: number; fahrzeugBestand: number; handlagerBestand: number;
};
type Fahrzeug = { id: string; name: string; kennung: string | null };
type GeraetCheck = { id: string; typ: "medizin" | "objekt"; name: string };
type Phase = "zaehlen" | "nachfuellen" | "geraete";
type GeraetEingabe = { vorhanden: boolean; zustand: string; bemerkung: string };

const PHASE_LABEL: Record<Phase, string> = { zaehlen: "Zählen", nachfuellen: "Nachfüllen", geraete: "Geräte" };
const ZUSTAENDE = ["In Ordnung", "Gebrauchsspuren", "Defekt"] as const;
const zustandTone = (z: string): "ok" | "gelb" | "rot" | "grau" =>
  z === "In Ordnung" ? "ok" : z === "Gebrauchsspuren" ? "gelb" : z === "Defekt" ? "rot" : "grau";
const GERAET_DEFAULT: GeraetEingabe = { vorhanden: true, zustand: "In Ordnung", bemerkung: "" };

// Adaptiver Schritt-Kopf: zeigt nur die Schritte, die dieses Fahrzeug wirklich hat.
function Schritte({ folge, aktiv }: { folge: Phase[]; aktiv: Phase }) {
  const idx = folge.indexOf(aktiv);
  return (
    <div className="checksteps">
      {folge.map((p, i) => (
        <div key={p} className={`stp ${i === idx ? "on" : i < idx ? "done" : ""}`}>
          <span className="no">{i < idx ? <Check size={13} /> : i + 1}</span> {PHASE_LABEL[p]}
        </div>
      ))}
    </div>
  );
}

export function CheckFlow({
  fahrzeuge,
  soll,
  geraete,
  preselect,
}: {
  fahrzeuge: Fahrzeug[];
  soll: Record<string, Pos[]>;
  geraete: Record<string, GeraetCheck[]>;
  preselect?: string | null;
}) {
  // Ein Code mit Fahrzeug-Ziel wählt das Fahrzeug direkt vor; sonst wie gehabt (nur eins → direkt).
  const [vehId, setVehId] = useState<string | null>(preselect ?? (fahrzeuge.length === 1 ? fahrzeuge[0].id : null));
  const [phase, setPhase] = useState<Phase>("zaehlen");
  const [ist, setIst] = useState<Record<string, number>>({});
  const [nachfuell, setNachfuell] = useState<Record<string, number>>({});
  const [geraeteState, setGeraeteState] = useState<Record<string, GeraetEingabe>>({});
  const [result, setResult] = useState<{ nachgefuellt: number; offen: number; geraeteAuffaellig: number } | null>(null);
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
  const geraeteListe = geraete[vehId] ?? [];
  const faecher = [...new Set(positionen.map((p) => p.fachLabel))];
  // Default = Soll ("voll annehmen, Gezähltes runterkorrigieren"). Der recorded Fahrzeugbestand
  // wird bewusst NICHT als Per-Position-Default genutzt: er ist pro Artikel (nicht pro Fach), und
  // derselbe Artikel in mehreren Fächern würde sich sonst vervielfachen.
  const istWert = (p: Pos) => ist[p.id] ?? p.soll;
  const nfWert = (p: Pos) => nachfuell[p.id] ?? 0;

  // Welche Schritte hat dieses Fahrzeug? Artikel bringen Zählen+Nachfüllen, Geräte hängen als
  // Quittier-Schritt hinten an. Der Commit passiert immer im letzten Schritt der Folge.
  const hatArtikel = positionen.length > 0;
  const hatGeraete = geraeteListe.length > 0;
  const schrittFolge: Phase[] = [
    ...(hatArtikel ? (["zaehlen", "nachfuellen"] as const) : []),
    ...(hatGeraete ? (["geraete"] as const) : []),
  ];
  const aktivePhase: Phase = schrittFolge.includes(phase) ? phase : (schrittFolge[0] ?? "zaehlen");
  const idx = schrittFolge.indexOf(aktivePhase);
  const istLetzter = idx === schrittFolge.length - 1;

  const geraetE = (id: string): GeraetEingabe => geraeteState[id] ?? GERAET_DEFAULT;
  const setGeraet = (id: string, patch: Partial<GeraetEingabe>) =>
    setGeraeteState((s) => ({ ...s, [id]: { ...(s[id] ?? GERAET_DEFAULT), ...patch } }));

  // Gemeinsamer Abschluss (aus dem jeweils letzten Schritt aufgerufen): Positionen + Geräte senden.
  const abschluss = () => {
    setErr(null);
    start(async () => {
      try {
        const r = await checkAbschluss({
          fahrzeugId: vehId,
          positionen: positionen.map((p) => ({ sollPositionId: p.id, ist: istWert(p), nachfuellMenge: nfWert(p) })),
          geraete: geraeteListe.map((g) => {
            const e = geraetE(g.id);
            return { geraetId: g.id, vorhanden: e.vorhanden, zustand: e.vorhanden ? e.zustand : undefined, bemerkung: e.bemerkung.trim() || undefined };
          }),
        });
        setResult({ nachgefuellt: r.nachgefuellt, offen: r.offen, geraeteAuffaellig: r.geraeteAuffaellig });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Fehler beim Abschließen – bitte erneut versuchen");
      }
    });
  };

  if (schrittFolge.length === 0) {
    return (
      <>
        <div className="screenhead">{veh.name}</div>
        <div className="card cardpad">Für dieses Fahrzeug ist weder ein Soll noch ein Gerät hinterlegt – nichts zu prüfen.</div>
      </>
    );
  }

  if (result) {
    const alles = result.offen === 0 && result.geraeteAuffaellig === 0;
    return (
      <>
        <div className="screenhead">{veh.name} · Fertig</div>
        <div className="card cardpad" style={{ borderLeft: `4px solid var(--${alles ? "ok" : "gelb"})` }}>
          <div className="rowname" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 16 }}>
            <Check size={18} style={{ color: `var(--${alles ? "ok" : "gelb"})` }} /> Check abgeschlossen
          </div>
          <div className="rowmeta" style={{ marginTop: 9 }}>
            {hatArtikel && <span className="chip chip-ok">{result.nachgefuellt} aus Handlager geholt</span>}
            {result.offen > 0 && <span className="chip chip-rot"><AlertTriangle size={11} /> {result.offen} fehlt weiterhin</span>}
            {result.geraeteAuffaellig > 0 && <span className="chip chip-rot"><AlertTriangle size={11} /> {result.geraeteAuffaellig} Gerät(e) auffällig</span>}
          </div>
          {result.offen > 0 && (
            <small style={{ color: "var(--stahl)", display: "block", marginTop: 8 }}>
              Das Handlager hatte nicht genug – bitte der Verwaltung melden. {result.offen} Teile fehlen weiterhin auf dem Fahrzeug.
            </small>
          )}
          {result.geraeteAuffaellig > 0 && (
            <small style={{ color: "var(--stahl)", display: "block", marginTop: 8 }}>
              Fehlende oder defekte Geräte bitte der Verwaltung melden.
            </small>
          )}
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={() => { setResult(null); setPhase(schrittFolge[0]); setIst({}); setNachfuell({}); setGeraeteState({}); setVehId(fahrzeuge.length === 1 ? vehId : null); }}>Weiterer Check</button>
      </>
    );
  }

  // ——— Schritt: Zählen ———
  if (aktivePhase === "zaehlen") {
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
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        <div className="card cardpad" style={{ marginBottom: 4 }}>
          <div className="rowname" style={{ fontSize: 14 }}>Wie viel liegt wirklich im Fahrzeug?</div>
          <small style={{ color: "var(--stahl)" }}>Jede Position ist auf Soll vorbelegt – mit <b>−</b> runterzählen, was fehlt.</small>
        </div>
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
        <div className="summary">
          <div className="info">
            <b>{unterSoll === 0 ? "Alles auf Soll" : `${unterSoll} unter Soll`}</b>
            <div>{unterSoll === 0 ? "Nichts nachzufüllen" : "Weiter zur Nachfüllung aus dem Handlager"}</div>
          </div>
          <button className="go" onClick={zurNachfuellung} style={{ display: "flex", alignItems: "center", gap: 6 }}>Weiter <ArrowRight size={16} /></button>
        </div>
      </>
    );
  }

  // ——— Schritt: Geräte quittieren ———
  if (aktivePhase === "geraete") {
    return (
      <>
        <div className="screenhead">{veh.name} · Geräte</div>
        <Schritte folge={schrittFolge} aktiv={aktivePhase} />
        {idx > 0 && <button className="btn btn-ghost" onClick={() => setPhase(schrittFolge[idx - 1])} style={{ marginBottom: 10 }}>← Zurück</button>}
        <div className="card cardpad" style={{ marginBottom: 4 }}>
          <div className="rowname" style={{ fontSize: 14 }}>Sind die Geräte da und in Ordnung?</div>
          <small style={{ color: "var(--stahl)" }}>Alles ist auf <b>vorhanden · In Ordnung</b> vorbelegt – nur Abweichungen antippen.</small>
        </div>
        <div className="card">
          {geraeteListe.map((g) => {
            const e = geraetE(g.id);
            const TypIcon = g.typ === "medizin" ? HeartPulse : Package;
            return (
              <div className="row" key={g.id} style={{ alignItems: "flex-start" }}>
                <div className="rowmain">
                  <div className="rowname" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <TypIcon size={14} style={{ color: "var(--stahl)" }} /> {g.name}
                  </div>
                  <div className="rowmeta" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    <button type="button" className={`chip chip-${e.vorhanden ? "ok" : "grau"}`} style={{ border: 0, cursor: "pointer" }} onClick={() => setGeraet(g.id, { vorhanden: true })}>vorhanden</button>
                    <button type="button" className={`chip chip-${!e.vorhanden ? "rot" : "grau"}`} style={{ border: 0, cursor: "pointer" }} onClick={() => setGeraet(g.id, { vorhanden: false })}>fehlt</button>
                    {e.vorhanden && (
                      <span style={{ display: "inline-flex", gap: 6, marginLeft: 4 }}>
                        {ZUSTAENDE.map((z) => (
                          <button key={z} type="button" className={`chip chip-${e.zustand === z ? zustandTone(z) : "grau"}`} style={{ border: 0, cursor: "pointer" }} onClick={() => setGeraet(g.id, { zustand: z })}>{z}</button>
                        ))}
                      </span>
                    )}
                  </div>
                  <input className="input" placeholder="Bemerkung (optional)" value={e.bemerkung} onChange={(ev) => setGeraet(g.id, { bemerkung: ev.target.value })} style={{ marginTop: 6 }} />
                </div>
              </div>
            );
          })}
        </div>
        {err && <div className="card cardpad"><div className="gateerr">{err}</div></div>}
        <div className="summary">
          <div className="info">
            <b>{geraeteListe.length} Gerät(e)</b>
            <div>Quittieren schließt den Check ab</div>
          </div>
          <button className="go" disabled={pending} onClick={abschluss} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PackageCheck size={16} /> Abschließen
          </button>
        </div>
      </>
    );
  }

  // ——— Schritt: Nachfüllen aus dem Handlager (bestätigen) ———
  // Handlager-Knappheit je Artikel: reicht der Bestand für die Summe aller Nachfüll-Positionen?
  const knappheit = new Map<string, { verfuegbar: number; gewuenscht: number }>();
  for (const p of positionen) {
    const eKn = knappheit.get(p.artikelId) ?? { verfuegbar: p.handlagerBestand, gewuenscht: 0 };
    eKn.gewuenscht += nfWert(p);
    knappheit.set(p.artikelId, eKn);
  }
  const nachfuellPositionen = positionen.filter((p) => Math.max(0, p.soll - istWert(p)) > 0);
  const summeNachfuell = positionen.reduce((s, p) => s + nfWert(p), 0);

  return (
    <>
      <div className="screenhead">{veh.name}</div>
      <Schritte folge={schrittFolge} aktiv={aktivePhase} />
      <button className="btn btn-ghost" onClick={() => setPhase("zaehlen")} style={{ marginBottom: 10 }}>← Zurück zum Zählen</button>
      {nachfuellPositionen.length === 0 ? (
        <div className="card cardpad">Nichts nachzufüllen – alle Positionen sind auf Soll. Du kannst {istLetzter ? "den Check direkt abschließen" : "direkt weiter"}.</div>
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
          <div>{istLetzter ? `Bestätigen bucht Handlager → ${veh.name}` : "Weiter zur Geräte-Prüfung"}</div>
        </div>
        {istLetzter ? (
          <button className="go" disabled={pending} onClick={abschluss} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <PackageCheck size={16} /> Gelegt & abschließen
          </button>
        ) : (
          <button className="go" onClick={() => setPhase("geraete")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Weiter <ArrowRight size={16} />
          </button>
        )}
      </div>
    </>
  );
}
