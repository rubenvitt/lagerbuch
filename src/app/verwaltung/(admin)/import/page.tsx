import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <>
      <div className="mainhead">
        <h1>CSV-Import</h1>
        <p>Artikel-Stammdaten per CSV anlegen · Startbestand wird als Korrektur-Buchung im Journal erfasst.</p>
      </div>
      <ImportForm />
    </>
  );
}
