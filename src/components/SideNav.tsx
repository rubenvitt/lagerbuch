"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, ClipboardCheck, ClipboardList, History, KeyRound, LayoutDashboard, Package, QrCode, ShoppingCart, Truck, Upload } from "lucide-react";
import type { ComponentType } from "react";

const NAV: { href: string; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { href: "/verwaltung", label: "Übersicht", icon: LayoutDashboard },
  { href: "/verwaltung/artikel", label: "Artikel", icon: Package },
  { href: "/verwaltung/verfall", label: "Verfall", icon: CalendarClock },
  { href: "/verwaltung/fahrzeuge", label: "Fahrzeuge", icon: Truck },
  { href: "/verwaltung/checks", label: "Checks", icon: ClipboardCheck },
  { href: "/verwaltung/bestellung", label: "Bestellung", icon: ShoppingCart },
  { href: "/verwaltung/inventur", label: "Inventur", icon: ClipboardList },
  { href: "/verwaltung/journal", label: "Journal", icon: History },
  { href: "/verwaltung/tokens", label: "Zugangs-Codes", icon: KeyRound },
  { href: "/verwaltung/etiketten", label: "Etiketten", icon: QrCode },
  { href: "/verwaltung/import", label: "Import", icon: Upload },
];

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="snav">
      {NAV.map(({ href, label, icon: Icon }) => {
        // "/verwaltung" itself must never match as a prefix of its children (every
        // other route starts with "/verwaltung/"), so it only matches exactly.
        const active = pathname === href || (href !== "/verwaltung" && pathname.startsWith(href + "/"));
        return (
          <Link key={href} href={href} className={`sitem${active ? " on" : ""}`}>
            <Icon size={17} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
