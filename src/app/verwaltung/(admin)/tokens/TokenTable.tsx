"use client";
import { useTransition } from "react";
import { Truck, Package, List } from "lucide-react";
import { setTokenAktiv } from "@/actions/tokens";
import { fmtTs } from "@/lib/format";

type Row = {
  id: string; code: string; label: string; aktiv: boolean; lastUsedAt: Date | null; createdAt: Date;
  zielTyp: "fahrzeug" | "artikel" | null; zielId: string | null; zielName: string | null;
};

function ZielChip({ t }: { t: Row }) {
  if (t.zielTyp === "fahrzeug") return <span className="chip chip-grau"><Truck size={11} /> {t.zielName}</span>;
  if (t.zielTyp === "artikel") return <span className="chip chip-grau"><Package size={11} /> {t.zielName}</span>;
  return <span className="chip chip-grau"><List size={11} /> Artikel-Liste</span>;
}

export function TokenTable({ tokens }: { tokens: Row[] }) {
  const [pending, start] = useTransition();
  if (tokens.length === 0) return <div className="card cardpad">Noch keine Codes. Lege oben den ersten an.</div>;
  return (
    <div className="card">
      {tokens.map((t) => (
        <div className="row" key={t.id}>
          <div className="rowmain">
            <div style={{ font: "600 15px var(--mono)" }}>{t.code}</div>
            <div className="rowmeta">
              <span>{t.label}</span>
              <ZielChip t={t} />
              <span className={`chip chip-${t.aktiv ? "ok" : "rot"}`}>{t.aktiv ? "aktiv" : "gesperrt"}</span>
              <small>{t.lastUsedAt ? `zuletzt ${fmtTs(t.lastUsedAt)}` : "nie benutzt"}</small>
            </div>
          </div>
          <button
            className={`btn slim ${t.aktiv ? "btn-ghost" : "btn-rot"}`}
            style={{ flex: "none" }}
            disabled={pending}
            onClick={() => start(() => setTokenAktiv({ id: t.id, aktiv: !t.aktiv }))}
          >
            {t.aktiv ? "Sperren" : "Reaktivieren"}
          </button>
        </div>
      ))}
    </div>
  );
}
