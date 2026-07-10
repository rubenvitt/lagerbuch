import Link from "next/link";

export default function KeinZugriff() {
  return (
    <div className="gate">
      <div className="gatebar" />
      <div className="gatebrand">Kein Zugriff</div>
      <div className="gatesub">
        Dein Konto ist nicht in der Gruppe für die Verwaltung. Wende dich an die
        Leitung.
      </div>
      <Link className="btn btn-ghost" href="/" style={{ marginTop: 16, maxWidth: 240 }}>
        Zurück
      </Link>
    </div>
  );
}
