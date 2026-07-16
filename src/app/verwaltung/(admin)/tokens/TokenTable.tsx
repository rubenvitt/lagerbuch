"use client";
import { useMemo, useState, useTransition } from "react";
import { Truck, Package, List } from "lucide-react";
import { setTokenAktiv } from "@/actions/tokens";
import { LoeschButton } from "@/components/LoeschButton";
import { Filterleiste, toggleInSet, type FilterChip } from "@/components/Filterleiste";
import { fmtTs } from "@/lib/format";

type Row = {
  id: string; code: string; label: string; aktiv: boolean; lastUsedAt: Date | null; createdAt: Date;
  zielTyp: "fahrzeug" | "artikel" | null; zielId: string | null; zielName: string | null;
};

type ZielFilter = "fahrzeug" | "artikel" | "liste";

function ZielChip({ t }: { t: Row }) {
  if (t.zielTyp === "fahrzeug") return <span className="chip chip-grau"><Truck size={11} /> {t.zielName}</span>;
  if (t.zielTyp === "artikel") return <span className="chip chip-grau"><Package size={11} /> {t.zielName}</span>;
  return <span className="chip chip-grau"><List size={11} /> Artikel-Liste</span>;
}

export function TokenTable({ tokens }: { tokens: Row[] }) {
  const [pending, start] = useTransition();
  const [suche, setSuche] = useState("");
  const [nurGesperrt, setNurGesperrt] = useState(false);
  const [zielFilter, setZielFilter] = useState<Set<ZielFilter>>(new Set());

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return tokens.filter((t) => {
      if (nurGesperrt && t.aktiv) return false;
      if (zielFilter.size > 0 && !zielFilter.has(t.zielTyp ?? "liste")) return false;
      if (q && !`${t.code} ${t.label} ${t.zielName ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tokens, suche, nurGesperrt, zielFilter]);

  const toggleZiel = (z: ZielFilter) => setZielFilter((prev) => toggleInSet(prev, z));

  const chips: FilterChip[] = [
    { label: "gesperrt", aktiv: nurGesperrt, onToggle: () => setNurGesperrt((v) => !v) },
    { label: "Fahrzeug", aktiv: zielFilter.has("fahrzeug"), onToggle: () => toggleZiel("fahrzeug"), icon: <Truck size={12} /> },
    { label: "Artikel", aktiv: zielFilter.has("artikel"), onToggle: () => toggleZiel("artikel"), icon: <Package size={12} /> },
    { label: "Artikel-Liste", aktiv: zielFilter.has("liste"), onToggle: () => toggleZiel("liste"), icon: <List size={12} /> },
  ];

  if (tokens.length === 0) return <div className="card cardpad">Noch keine Codes. Lege oben den ersten an.</div>;
  return (
    <>
      <Filterleiste
        suche={suche}
        onSuche={setSuche}
        platzhalter="Code, Label oder Ziel suchen…"
        chips={chips}
        treffer={{ gezeigt: gefiltert.length, gesamt: tokens.length }}
      />
      <div className="card">
        {gefiltert.length === 0 && <div className="empty">Kein Code gefunden.</div>}
        {gefiltert.map((t) => (
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
          <div style={{ display: "flex", gap: 8, flex: "none", alignItems: "center" }}>
            <button
              className={`btn slim ${t.aktiv ? "btn-ghost" : "btn-rot"}`}
              style={{ flex: "none" }}
              disabled={pending}
              onClick={() => start(() => setTokenAktiv({ id: t.id, aktiv: !t.aktiv }))}
            >
              {t.aktiv ? "Sperren" : "Reaktivieren"}
            </button>
            <LoeschButton
              art="token"
              id={t.id}
              name={t.code}
              typLabel="Zugangs-Code"
              deaktivierenLabel="Sperren"
              className="btn btn-ghost-rot slim"
              iconOnly
            />
          </div>
        </div>
        ))}
      </div>
    </>
  );
}
