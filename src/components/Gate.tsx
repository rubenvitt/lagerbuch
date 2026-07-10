"use client";

import { useActionState } from "react";
import { signIn } from "next-auth/react";
import { Key } from "lucide-react";
import { einloesenAmGate, type GateState } from "@/app/(gate)/actions";

export interface GateBranding {
  appOrg: string;
  appTagline: string;
}

export function Gate({
  branding, oidcEnabled, devLoginEnabled, returnTo,
}: {
  branding: GateBranding; oidcEnabled: boolean; devLoginEnabled: boolean; returnTo: string;
}) {
  const [state, formAction, pending] = useActionState<GateState, FormData>(einloesenAmGate, {});

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
          <p>Für Helfer:innen: Code vom Regal- oder Fahrzeugetikett eingeben – ohne Konto, ohne Passwort. Nur Entnahme.</p>
          <form action={formAction} style={{ display: "contents" }}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input className="input tokeninput" name="code" placeholder="000-000" aria-label="Zugangs-Code" autoComplete="off" />
            {state.error && <div className="gateerr">{state.error}</div>}
            <button className="btn btn-rot" type="submit" disabled={pending}>Weiter</button>
          </form>
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
