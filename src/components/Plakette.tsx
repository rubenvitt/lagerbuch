import type { Ampel } from "@/lib/domain/verfall";

function fmtVerfall(v: string): string {
  const [y, m] = v.split("-");
  return `${m}/${y.slice(2)}`;
}

export function Plakette({ verfall, ampel }: { verfall: string; ampel: Ampel }) {
  const farbe = ampel === "rot" ? "var(--rot)" : ampel === "gelb" ? "var(--gelb)" : "var(--ok)";
  const monat = Number(verfall.split("-")[1]);
  const ticks = [];
  for (let i = 0; i < 12; i++) {
    const w = ((i * 30 - 90) * Math.PI) / 180;
    const aktiv = i === monat - 1;
    const r1 = aktiv ? 13.5 : 15.2;
    const r2 = 18.6;
    ticks.push(
      <line
        key={i}
        x1={20 + r1 * Math.cos(w)}
        y1={20 + r1 * Math.sin(w)}
        x2={20 + r2 * Math.cos(w)}
        y2={20 + r2 * Math.sin(w)}
        stroke={aktiv ? farbe : "#C7CDD1"}
        strokeWidth={aktiv ? 3.4 : 1.7}
        strokeLinecap="round"
      />,
    );
  }
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" role="img" aria-label={`Verfall ${fmtVerfall(verfall)}`} style={{ flex: "none" }}>
      <circle cx="20" cy="20" r="19" fill="#fff" stroke={farbe} strokeWidth="1.6" />
      {ticks}
      <text x="20" y="23.4" textAnchor="middle" style={{ font: "600 8.6px var(--mono)", fill: "var(--tinte)" }}>
        {fmtVerfall(verfall)}
      </text>
    </svg>
  );
}
