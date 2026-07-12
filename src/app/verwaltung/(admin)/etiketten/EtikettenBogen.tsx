"use client";
import { useState } from "react";
import { Printer } from "lucide-react";

type A = { id: string; name: string; fach: string; url: string; qr: string };
type T = { code: string; label: string; url: string; qr: string };

export function EtikettenBogen({ artikel, tokens }: { artikel: A[]; tokens: T[] }) {
  const keys = [...artikel.map((a) => `a:${a.id}`), ...tokens.map((t) => `t:${t.code}`)];
  const [selected, setSelected] = useState<Set<string>>(new Set(keys));

  function toggle(k: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }

  function etikett(k: string, qr: string, titel: string, sub: string) {
    return (
      <label className={`etikett${selected.has(k) ? "" : " deselected"}`} key={k}>
        <input type="checkbox" className="no-print" checked={selected.has(k)} onChange={() => toggle(k)} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR ${titel}`} width={72} height={72} />
        <div className="etikett-txt"><div className="etikett-titel">{titel}</div><div className="etikett-sub">{sub}</div></div>
      </label>
    );
  }

  if (keys.length === 0) return <div className="card cardpad no-print">Keine aktiven Artikel oder Token.</div>;

  return (
    <>
      <div className="etikett-controls no-print" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className="btn btn-ghost" onClick={() => setSelected(new Set(keys))}>Alle</button>
        <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>Keine</button>
        <button className="btn btn-rot" onClick={() => window.print()}><Printer size={15} /> Drucken ({selected.size})</button>
      </div>
      <div className="etikettbogen">
        {artikel.map((a) => etikett(`a:${a.id}`, a.qr, a.name, a.fach))}
        {tokens.map((t) => etikett(`t:${t.code}`, t.qr, t.label, t.code))}
      </div>
    </>
  );
}
