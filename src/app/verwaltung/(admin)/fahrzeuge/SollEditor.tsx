import type { SollZeile } from "@/db/queries";
export function SollEditor({ fahrzeugId, positionen, artikel }: { fahrzeugId: string; positionen: SollZeile[]; artikel: { id: string; name: string; fach: string; einheit: string }[] }) {
  void fahrzeugId; void artikel;
  const faecher = [...new Set(positionen.map((p) => p.fachLabel))];
  return (
    <div className="card">
      {positionen.length === 0 && <div className="cardpad">Kein Soll definiert.</div>}
      {faecher.map((fach) => (
        <div key={fach}>
          <div className="fachhead">{fach}</div>
          {positionen.filter((p) => p.fachLabel === fach).map((p) => (
            <div className="row" key={p.id}>
              <div className="rowmain"><div className="rowname">{p.artikelName}</div><div className="rowmeta"><span className="fach">{p.handlagerFach}</span></div></div>
              <div className="bignum" style={{ fontSize: 18 }}>{p.soll}<small>{p.einheit}</small></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
