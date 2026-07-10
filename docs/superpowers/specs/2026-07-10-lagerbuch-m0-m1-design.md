# Lagerbuch M0 + M1 — Design-Spec

**Stand:** 2026-07-10 · **Scope dieses Durchlaufs:** Meilenstein M0 (Walking Skeleton) + M1 (Datenkern & Verwaltung)

---

## 1. Kontext & Autorität

Die maßgebliche Projekt-Spezifikation ist [`implementierungsplan.md`](../../../implementierungsplan.md) im Repo-Root: Architektur, Technologie-Entscheidungen (§3), Konfiguration/Branding (§4), Datenmodell (§5), Auth & Rollen (§6), Kernlogik (§7), Anwendungsstruktur (§8), Dockerfile (§9), Deployment (§10), CI/CD (§11), Teststrategie (§12), Meilensteine (§13). Die UI-Referenz ist [`mockup.jsx`](../../../mockup.jsx) (Klickdummy v2 — Komponenten, Wording, Flows).

**Dieses Dokument dupliziert den Plan nicht.** Es hält nur das fest, was für den aktuellen Durchlauf präzisiert oder gegenüber dem Plan geändert wurde, und definiert scharfe Abnahmekriterien für M0 und M1. Bei Konflikt gewinnt dieses Dokument (es ist jünger und trägt die bestätigten Entscheidungen).

---

## 2. Bestätigte Entscheidungen & Abweichungen vom Plan

| Thema | Plan (Original) | Für diesen Durchlauf bestätigt |
|---|---|---|
| GitHub-Owner | `ai-systems-manager`-Org, self-hosted ARM64-Runner | **`rubenvitt`** (persönlich), Repo **public** → Image `ghcr.io/rubenvitt/lagerbuch` |
| CI-Runner | Self-hosted, nativ arm64 | **GitHub-hosted**, Multi-Arch (`linux/amd64` + `linux/arm64`) per **buildx/QEMU** |
| Container-Package | (offen) | **public** (Portainer zieht ohne Registry-Auth) |
| Node-Base | `node:26-slim` | **`node:24-slim`** (LTS; Node 26 ist 07/2026 noch nicht LTS). better-sqlite3-Prebuilds für glibc/arm64 vorhanden |
| Toolchain | pnpm | **pnpm + mise** — `mise.toml` pinnt Node 24 + pnpm |
| `compose.yaml` | inkl. Traefik-Labels + `infrastructure`-Netz | **Minimal**: Service, Image, `restart`, Env, Named Volume, Port `3000`. **Kein Traefik, kein externes Netz.** Reverse-Proxy/TLS/DNS macht der Betreiber auf dem Server |
| Deploy-Ziel | Staging + Prod-Domains | Staging deploy-first; konkrete Domain/Proxy per Betreiber, im Repo nur Platzhalter |
| Betriebsdoku | Betriebs-README (M6) | Zusätzlich **`deployment.md`** als nicht-opinioniertes Runbook, schon in M0 angelegt |
| Verwaltungs-Auth (lokal) | nur OIDC | Prod = OIDC (Pocket ID); zusätzlich **dev-only Demo-Login** (siehe §5), in Prod hart deaktiviert |

Persönliche Angaben (reale Org, Domains, Hostnamen, Kennzeichen) wurden aus `implementierungsplan.md` und `mockup.jsx` entfernt, bevor committet wird (Repo ist public). Reale Werte leben ausschließlich in `stack.env` (gitignored) bzw. in der Server-Konfiguration.

---

## 3. Scope-Grenzen dieses Durchlaufs

**Enthalten:** alles unter M0 (§4) und M1 (§5).

**Bewusst NICHT enthalten** (spätere Meilensteine, unverändert laut Plan §13):
- Helfer-Flow / Tokens / Rate-Limit / `/t/`, `/a/` (M2)
- Chargen-Plakette/Ampel-UI, Warnlisten, Dashboard-KPIs über die Grundübersicht hinaus, „aussondern" (M3)
- Soll-Editor & Fahrzeug-Check (M4)
- Bestellvorschlag-UI & Inventurmodus (M5)
- Etikettendruck, produktives Backup/Restore-Proben, Go-Live (M6)

Das Datenmodell (§5 des Plans) wird in M1 **vollständig** angelegt (auch Tabellen für spätere Meilensteine: `tokens`, `soll_positionen`, `checks`), damit Migrationen additiv bleiben. UI/Logik dazu kommt in den jeweiligen Meilensteinen.

---

## 4. Meilenstein M0 — Walking Skeleton

**Ziel:** Ein deploybares Next.js-Skelett mit Branding, Health-Check und vollständiger CI/CD-Kette bis GHCR; Staging läuft.

### Deliverables
1. **Projekt-Setup:** `pnpm` + `mise.toml` (Node 24, pnpm), Next.js 15 (App Router, React 19, TypeScript), `output: "standalone"`, ESLint, Vitest, Playwright, Tailwind CSS 4.
2. **Config-Modul** `src/lib/config.ts`: parst `process.env` per zod mit Defaults (Plan §4). Fehlkonfiguration crasht beim Start. Liefert typisiertes `config`-Objekt.
3. **Branding aus Config:** Layout, `<title>`, Gate-Seite, `manifest.webmanifest` lesen ausschließlich aus `config` (`APP_NAME`, `APP_ORG`, `APP_TAGLINE`).
4. **Gate-Seite** (`app/(gate)/page.tsx`): portiert aus `mockup.jsx` (`Gate`) — Code-Eingabefeld + OIDC-Button, mit `APP_ORG`-Branding. In M0 sind die Buttons noch nicht funktional verdrahtet (Token-Einlösung/OIDC folgt M1/M2); die Seite rendert und ist die DoD-sichtbare Fläche.
5. **Design-System:** Tailwind 4 `@theme` mit den Tokens aus dem Dummy (Regalgrau, DRK-Rot, Gelb/Grün, Linien) als CSS-Variablen. Fonts (Barlow, Barlow Condensed, IBM Plex Mono) **self-hosted via `next/font/google`** (Download zur Build-Zeit, kein Runtime-CDN).
6. **`/api/health`** (`app/api/health/route.ts`): 200 + `{ status: "ok" }` (in M0 ohne DB-Check; M1 erweitert optional um DB-Ping).
7. **`manifest.webmanifest`** als Route, Werte aus `config`.
8. **Dockerfile** (Plan §9, angepasst auf `node:24-slim`): Multi-Stage, standalone, non-root, HEALTHCHECK.
9. **`compose.yaml`** (minimal, ohne Traefik) + **`stack.env.example`** + **`generate-secrets.sh`**.
10. **`deployment.md`**: nicht-opinioniertes Runbook (Image ziehen, Env setzen, Volume, Start, Health prüfen, Update/Rollback, Backup-Ort). Reverse-Proxy/TLS als „durch Betreiber" markiert, mit Hinweis auf benötigten Header/Port.
11. **CI** `.github/workflows/ci.yaml`, drei Jobs (Plan §11, angepasst):
    - **check**: `pnpm lint`, `pnpm typecheck`, `pnpm test`, Drizzle-Migrationscheck (kein Diff). In M0 ggf. noch ohne Drizzle-Teil, wird in M1 aktiv.
    - **e2e**: Image bauen, Container mit Wegwerf-DB starten, Playwright-Smoke (Gate rendert, `/api/health` grün).
    - **publish**: buildx Multi-Arch Push nach GHCR — `edge` + `sha-…` auf `main`, `vX.Y.Z` + `latest` bei Git-Tag.
12. **`.gitignore`**: `node_modules`, `.next`, `stack.env`, `/data`, lokale DB-Dateien, Playwright-Artefakte.

### Definition of Done (M0)
- **Lokal verifizierbar (durch mich):** `pnpm build` grün; Container startet; Gate-Seite rendert mit `APP_ORG`-Branding; `curl /api/health` → 200; `pnpm lint`/`typecheck`/`test` grün; `manifest.webmanifest` liefert Config-Werte; Docker-Image baut (mind. amd64 lokal).
- **Deploy-Hälfte (Handoff, siehe §7):** Push auf `main` erzeugt via CI ein `edge`-Multi-Arch-Image in GHCR (public); Betreiber zieht es im Portainer-Stack; Staging liefert die Gate-Seite; `/api/health` grün.

---

## 5. Meilenstein M1 — Datenkern & Verwaltung

**Ziel:** Der Lagerwart pflegt real erste Artikel auf Staging; Journal korrekt; Domain-Regeln getestet.

### Deliverables
1. **Drizzle-Schema** `src/db/schema.ts`: alle Tabellen aus Plan §5 (`lagerorte`, `artikel`, `chargen`, `buchungen`, `soll_positionen`, `tokens`, `checks`, `users`) inkl. `artikel.bestelltAt`, Indizes.
2. **Migrationen** (`drizzle/`, eingecheckt) via drizzle-kit; **Append-only-Trigger** (UPDATE/DELETE auf `buchungen` → `RAISE(ABORT, …)`); PRAGMAs beim Start (`journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`).
3. **`instrumentation.ts`:** führt Migrationen beim Container-Start aus (vor Annahme von Anfragen); startet den internen Backup-Job (nächtlicher Snapshot nach `/data/backups/`, Retention 14 Tage — Implementierung ok in M1, Restore-Probe erst M6).
4. **Verwaltungs-Auth (Plan §6):** Auth.js v5 mit generischem OIDC-Provider (Pocket ID); Callback prüft Gruppen-Claim `OIDC_ADMIN_GROUP`; ohne Gruppe → freundliche „kein Zugriff"-Seite; `users`-Upsert beim ersten Login. Middleware + Per-Action-Prüfung für `/verwaltung/*`.
5. **Dev-Demo-Login:** zusätzlicher Auth.js-**Credentials-Provider**, der **nur** registriert wird, wenn `AUTH_DEV_LOGIN === "true"` **und** `NODE_ENV !== "production"`. Erzeugt eine Admin-Session (Fake-User in Admin-Gruppe) ohne OIDC. **Guard:** das zod-Env-Schema wirft beim Start, falls `AUTH_DEV_LOGIN=true` bei `NODE_ENV=production`. Das Prod-Image setzt `NODE_ENV=production` und niemals `AUTH_DEV_LOGIN` → Demo-Login existiert im deployten Container nicht.
6. **Domain-Schicht** `src/lib/domain/` (pure Functions, Plan §7): `bestand.ts` (Aggregation), `fefo.ts` (FEFO-Verteilung inkl. Kappung & Mehr-Chargen-Split), `verfall.ts` (Ampel), `vorschlag.ts` (Bestellvorschlag). Jede Regel mit Unit-Tests **vor** der UI.
7. **Server Actions** (`src/actions/`, zod-validiert): Zugang (Charge wählen/neu), Entnahme (FEFO in einer Transaktion, serverseitige Kappung mit gemeldeter Ist-Menge), Artikel-CRUD, Korrektur.
8. **Verwaltungs-UI** (portiert aus `mockup.jsx` `AdminView`): Übersicht (KPIs + kritische Artikel + letzte Buchungen), Artikel-Tabelle + Drawer (Stammdaten, Buchung Zugang/Entnahme, Chargenliste, letzte Buchungen), Neuer-Artikel-Drawer, Journal-Seite.
9. **CSV-Import:** Artikel + Startbestand als `korrektur`-Buchung, über die Verwaltung.
10. **Tests:** Unit (alle §7-Regeln, Ampel-Fenstergrenzen 31/56 Tage, Monatsende, Schaltjahr); Integration gegen `:memory:`-SQLite + Migrationen (Buchung in Transaktion, Append-only-Trigger schlägt bei UPDATE an, Grundfälle).

### Definition of Done (M1)
- **Lokal verifizierbar (durch mich):** Unit- & Integration-Tests grün; per Demo-Login: Artikel anlegen → Zugang mit neuer Charge buchen → Bestand = Summe der Buchungen; Entnahme verteilt FEFO über Chargen, kappt bei Übermenge, schreibt Journalzeilen mit Quelle; Journal ist append-only (UPDATE/DELETE blockiert); CSV-Import erzeugt Korrekturbuchungen.
- **Deploy-Hälfte (Handoff):** auf Staging via OIDC (Pocket-ID-Staging-Client) einloggbar; Lagerwart pflegt reale erste ~20 Artikel; Journal korrekt.

---

## 6. Verbindliche Domain-Regeln (Referenz Plan §7)

Unverändert gültig; hier nur als Test-Checkliste, damit M1-DoD prüfbar ist:
1. Bestand = `SUM(menge)` der Buchungen (Artikel bzw. je `charge_id`). Kein zweiter Wahrheitsspeicher.
2. FEFO-Entnahme über Chargen mit Rest > 0 nach aufsteigendem Verfall; je Charge eine Buchungszeile; ganze Verteilung in einer Transaktion; Übermenge auf Bestand gekappt, tatsächliche Menge zurückgemeldet.
3. Zugang erfordert Charge (bestehend/neu, Verfall `YYYY-MM`); Pseudo-Charge „ohne Verfall" = `2099-12`.
4. Verfall-Ampel: Ablauf = Monatsende; Resttage ≤ `WARN_TAGE_KRITISCH` rot, ≤ `WARN_TAGE_FAELLIG` gelb, sonst grün.
5. Bestellvorschlag: Bestand < Mindestbestand; Menge = `BESTELL_FAKTOR × Mindestbestand − Bestand`; `bestelltAt` resettet beim nächsten Zugang. (UI erst M5; Domain-Funktion + Tests bereits M1.)
6. Fahrzeug-Check (M4) — hier nicht.
7. Inventur/Korrektur: Ist-Wert je Artikel; Differenz < 0 FEFO-verteilt, > 0 jüngster/neuer Charge zugebucht; `typ = korrektur` mit Pflicht-Kommentar. (Voll-UI M5; Buchungspfad + Regel bereits M1.)

---

## 7. Handoff / Prerequisites (durch Betreiber)

Blockieren den Code-Start **nicht**; werden beim jeweiligen Schritt geklärt:
1. **GitHub-Repo** `rubenvitt/lagerbuch` **public** anlegen (via `gh repo create`, vor erstem Push bestätigen).
2. **GHCR-Package** nach erstem Publish auf **public** stellen.
3. **Portainer-Stack** (Staging) aus `compose.yaml` + `stack.env`; Reverse-Proxy/TLS/DNS betreiberseitig.
4. **Pocket-ID-Staging-OIDC-Client** (für M1-Login): `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, Redirect-URI. Lokal überbrückt der Demo-Login.

---

## 8. Verifikationsstrategie (was ich vor „fertig" prüfe)

- **M0:** `pnpm build` + Container-Start + `curl`-Health + Gate-Render (headless Browser/Playwright-Smoke) + Docker-Build.
- **M1:** Vitest (Unit + Integration) grün + manueller End-to-End-Durchlauf per Demo-Login gegen den echten Flow (Artikel → Zugang → Entnahme → Journal), nicht nur Tests.
- Harter **Review-Checkpoint nach M0** (deployed & grün bzw. lokal grün + Handoff dokumentiert), bevor M1 startet.

---

## 9. Offene Mikroentscheidungen (aufgelöst)

- **Fonts:** `next/font/google` (self-hostet zur Build-Zeit) statt manueller Font-Dateien — erfüllt „kein Runtime-CDN".
- **Health-Check-Tiefe:** M0 statisch `ok`; M1 optional DB-Ping ergänzen (nicht DoD-kritisch).
- **Migrations-Timing:** ausschließlich via `instrumentation.ts` beim Start, nicht im Build.
- **Secrets:** `AUTH_SECRET`, `HELFER_SESSION_SECRET` via `generate-secrets.sh` (`openssl rand -base64 48`); `HELFER_SESSION_SECRET` schon in M0 im Schema/Config, genutzt ab M2.
