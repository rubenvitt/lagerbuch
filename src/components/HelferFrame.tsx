"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, QrCode, X } from "lucide-react";
import { beenden } from "@/app/helfer/actions";

export function HelferFrame({ tokenLabel, children }: { tokenLabel: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const checkAktiv = pathname.startsWith("/helfer/check");
  return (
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
        <Link className={`tab${checkAktiv ? "" : " on"}`} href="/helfer"><QrCode size={20} /><span>Entnahme</span></Link>
        <Link className={`tab${checkAktiv ? " on" : ""}`} href="/helfer/check"><ClipboardCheck size={20} /><span>Fahrzeug-Check</span></Link>
      </nav>
    </div>
  );
}
