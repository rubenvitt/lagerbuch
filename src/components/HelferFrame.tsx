import { QrCode, X } from "lucide-react";
import { beenden } from "@/app/helfer/actions";

export function HelferFrame({ tokenLabel, children }: { tokenLabel: string; children: React.ReactNode }) {
  return (
    <div className="stage">
      <div className="app">
        <div className="stripe" />
        <header className="topbar">
          <div>
            <div className="brand">LAGER<span>BUCH</span></div>
            <div className="brandsub">{tokenLabel}</div>
          </div>
          <form action={beenden}>
            <button className="filter" type="submit" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <X size={13} /> Beenden
            </button>
          </form>
        </header>
        <main className="content">{children}</main>
        <nav className="tabbar">
          <span className="tab on"><QrCode size={20} /><span>Entnahme</span></span>
        </nav>
      </div>
      <div className="framecap">HELFER-ANSICHT · mobile-first, läuft auf jedem Diensthandy</div>
    </div>
  );
}
