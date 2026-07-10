"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Key, QrCode } from "lucide-react";

export interface GateBranding {
  appOrg: string;
  appTagline: string;
}

export function Gate({
  branding,
  oidcEnabled,
  devLoginEnabled,
}: {
  branding: GateBranding;
  oidcEnabled: boolean;
  devLoginEnabled: boolean;
}) {
  const [code, setCode] = useState("");

  return (
    <div className="gate">
      <div className="gatebar" />
      <div className="gatebrand">
        LAGER<span>BUCH</span>
      </div>
      <div className="gatesub">
        {branding.appOrg ? `${branding.appOrg} · ` : ""}
        {branding.appTagline}
      </div>
      <div className="gatecards">
        <div className="gatecard">
          <h2>Im Dienst</h2>
          <p>
            Für Helfer:innen: Code vom Regal- oder Fahrzeugetikett eingeben –
            ohne Konto, ohne Passwort. Nur Entnahme &amp; Fahrzeug-Check.
          </p>
          <input
            className="input tokeninput"
            placeholder="000-000"
            value={code}
            aria-label="Zugangs-Code"
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn btn-rot" disabled>
            Weiter
          </button>
          <button className="btn btn-ghost" disabled>
            <QrCode size={16} /> Fahrzeug-Code scannen
          </button>
        </div>
        <div className="gatecard">
          <h2>Verwaltung</h2>
          <p>
            Volles Lagerbuch: Artikel &amp; Chargen, Soll-Bestückung der
            Fahrzeuge, Bestellvorschläge, Journal und Zugangs-Codes.
          </p>
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-tinte"
            disabled={!oidcEnabled}
            onClick={() => signIn("oidc", { callbackUrl: "/verwaltung" })}
          >
            <Key size={16} /> Mit Pocket ID anmelden
          </button>
          {devLoginEnabled && (
            <button
              className="btn btn-ghost"
              onClick={() => signIn("dev-login", { callbackUrl: "/verwaltung" })}
            >
              Demo-Login (nur Entwicklung)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
