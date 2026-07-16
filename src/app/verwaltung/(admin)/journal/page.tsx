import { getDb } from "@/db";
import { journalEintraege, type BuchungTyp } from "@/db/queries";
import { fmtTs, parseDatumGrenze, typLabel } from "@/lib/format";
import { JournalFilter } from "./JournalFilter";

export const dynamic = "force-dynamic";

const TYPEN: BuchungTyp[] = ["zugang", "entnahme", "korrektur", "umlagerung"];

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; typ?: string; von?: string; bis?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const typ = TYPEN.includes(sp.typ as BuchungTyp) ? (sp.typ as BuchungTyp) : undefined;
  const von = sp.von ?? "";
  const bis = sp.bis ?? "";

  const journal = journalEintraege(getDb(), {
    q: q || undefined,
    typ,
    von: parseDatumGrenze(von, false),
    bis: parseDatumGrenze(bis, true),
  });

  return (
    <>
      <div className="mainhead">
        <h1>Journal</h1>
        <p>Append-only Buchungsjournal – Bestand ist immer die Summe der Buchungen. Zeigt die neuesten 100 Treffer.</p>
      </div>
      <JournalFilter q={q} typ={typ ?? ""} von={von} bis={bis} />
      <div className="card" style={{ overflowX: "auto" }}>
        {journal.length === 0 ? (
          <div className="empty">Keine Buchung gefunden.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Artikel</th>
                <th>Vorgang</th>
                <th>Δ</th>
                <th>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((j) => {
                const label = typLabel(j.typ);
                return (
                  <tr key={j.id}>
                    <td className="mono">{fmtTs(j.ts)}</td>
                    <td style={{ fontWeight: 600 }}>{j.artikelName}</td>
                    <td>{j.kommentar ? `${label} · ${j.kommentar}` : label}</td>
                    <td className={`mono jdelta ${j.menge < 0 ? "minus" : "plus"}`}>
                      {j.menge > 0 ? "+" : ""}
                      {j.menge}
                    </td>
                    <td>
                      <span className="chip chip-grau" style={{ fontSize: 10.5 }} title={j.quelleId}>
                        {j.quelleName}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
