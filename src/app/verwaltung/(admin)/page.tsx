import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function VerwaltungHome() {
  const session = await auth();
  return (
    <>
      <div className="mainhead">
        <h1>Übersicht</h1>
      </div>
      <div className="card cardpad">
        Angemeldet als <strong>{session?.user?.name ?? "—"}</strong>. Der Datenkern
        steht — Artikel, Buchungen und Journal kommen in M1b.
      </div>
    </>
  );
}
