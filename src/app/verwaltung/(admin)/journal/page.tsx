import { getDb } from "@/db";
import { journalEintraege } from "@/db/queries";
import { fmtTs, typLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function JournalPage() {
  const db = getDb();
  const journal = journalEintraege(db);

  return (
    <>
      <div className="mainhead">
        <h1>Journal</h1>
        <p>Append-only Buchungsjournal – Bestand ist immer die Summe der Buchungen.</p>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        {journal.length === 0 ? (
          <div className="empty">Noch keine Buchungen.</div>
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
                      <span className="chip chip-grau mono" style={{ fontSize: 10.5 }}>
                        {j.quelleId}
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
