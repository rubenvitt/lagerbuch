# Lagerbuch – Implementierungsplan

**Materialverwaltung für Bereitschaften** · Von Klickdummy zu produktionsfähiger App
Stand: 10.07.2026 · Zielumgebung: Docker-Host (Portainer, Traefik, ARM64)

---

## 1. Ziel und Leitplanken

Lagerbuch ersetzt die manuelle Bestandsführung des Handlagers einer Bereitschaft. Die App führt Bestände als append-only Buchungsjournal, verwaltet Chargen mit Verfallsdaten (FEFO), erzeugt Bestellvorschläge bei Unterschreitung des Mindestbestands und bildet den Fahrzeug-Check mit automatischer Abbuchung der Fehlmengen ab.

Zwei Zugangswege, wie im Klickdummy validiert: **Helfer:innen** kommen über einen Code vom Regal-/Fahrzeugetikett rein (kein Konto, keine Personenzuordnung) und können nur entnehmen und checken. Die **Verwaltung** meldet sich per OIDC (Pocket ID) an und hat alle Funktionen inklusive Soll-Bestückung und Code-Verwaltung.

**Nicht-Ziele für Version 1:** kein Offline-Modus (nur tolerantes Verhalten), kein In-App-Kamera-Scanner (Deep-Links reichen), keine Mandantenfähigkeit (eine Instanz = eine Bereitschaft, Branding per Konfiguration), keine Beschaffungs-/Bestell-Workflows über die Vorschlagsliste hinaus.

**Leitplanken:** Eine Codebasis, ein Container, eine SQLite-Datei. Jede Abhängigkeit muss sich gegen „läuft in 3 Jahren noch ohne Pflege" rechtfertigen. Deploy-first: ab Meilenstein 0 läuft ein Walking Skeleton auf Staging, jede weitere Arbeit landet dort automatisch.

---

## 2. Architekturüberblick

```
                         ┌────────────────────────────────────────────┐
  Helfer:in (Handy)      │  Der Host · Docker · Portainer-Stack       │
  QR → https://…/a/123   │                                            │
 ────────────────────►   │  ┌──────────┐      ┌─────────────────────┐ │
                         │  │ Traefik  │ ───► │ lagerbuch (Next.js) │ │
  Verwaltung (Desktop)   │  │ TLS      │      │  · Server Actions   │ │
 ────────────────────►   │  └──────────┘      │  · Drizzle ORM      │ │
                         │        ▲           │  · Auth.js (OIDC)   │ │
  Pocket ID (OIDC) ──────┼────────┘           │  · Helfer-Session   │ │
                         │                    └─────────┬───────────┘ │
                         │                              ▼             │
                         │                    Volume /data            │
                         │                    · lagerbuch.db (WAL)    │
                         │                    · backups/ (nightly)    │
                         └────────────────────────────────────────────┘
```

Ein einziger Container. Kein separater Datenbank-Service, kein Redis, kein Worker – SQLite im WAL-Modus trägt diese Last (eine Bereitschaft, zweistellige Nutzerzahl, dreistellige Buchungen pro Monat) mit riesigem Abstand.

---

## 3. Technologie-Entscheidungen

| Baustein | Entscheidung | Begründung |
|---|---|---|
| Framework | **Next.js 15** (App Router, React 19, TypeScript) | Die Klickdummy-Komponenten (Plakette, Stepper, Check-Flow, Admin-Tabellen) portieren nahezu 1:1. Server Actions ersparen API-Boilerplate. `output: "standalone"` ergibt einen schlanken Container. |
| Datenbank | **SQLite** via **Drizzle ORM + better-sqlite3** | Eine Datei, synchroner Treiber, triviale Backups, Migrations mit drizzle-kit. Kein Betriebsaufwand. |
| Verwaltungs-Auth | **Auth.js v5** mit generischem OIDC-Provider gegen **Pocket ID** | Pocket ID läuft bereits; Standard-OIDC (Authorization Code + PKCE). Zugriff über Gruppen-Claim `lagerbuch-admin`. |
| Helfer-Auth | Eigene signierte Session (**jose**, httpOnly-Cookie, 12 h) nach Code-Eingabe/-Scan | Bewusst getrennt von Auth.js: anderer Lebenszyklus, kein Nutzerobjekt, nur `{tokenId, scopeLagerortId, exp}`. |
| Validierung | **zod** an jeder Action-/Route-Grenze | Auch die Env-Konfiguration wird per zod-Schema geparst – Fehlkonfiguration crasht beim Start, nicht zur Laufzeit. |
| Styling | **Tailwind CSS 4** mit den Design-Tokens aus dem Dummy als CSS-Variablen (`@theme`) | Farb-/Typo-System (Regalgrau, DRK-Rot, Barlow/Barlow Condensed/IBM Plex Mono) bleibt erhalten; Fonts self-hosted via `next/font` (kein Google-CDN im Einsatzbetrieb). |
| QR-Codes | **qrcode** (npm) + Print-Stylesheet für Etikettenbögen | Deep-Links statt In-App-Scanner: jede native Kamera-App genügt. |
| Logging | **pino** (JSON auf stdout) + `/api/health` | Portainer/`docker logs` reichen für V1; OTel ist Backlog. |

Alternative SvelteKit wäre schlanker, verliert aber den Portierungsvorteil des Dummys – bewusst dagegen entschieden.

---

## 4. Konfiguration und Branding

„DRK Bereitschaft Musterstadt · Materialverwaltung" ist **keine Konstante**, sondern Konfiguration. Ein Server-Modul `src/lib/config.ts` parst `process.env` per zod mit Defaults; das Layout, die Gate-Seite, der `<title>` und das per Route generierte `manifest.webmanifest` (PWA-Name/-Farben) lesen ausschließlich daraus.

| Variable | Default | Zweck |
|---|---|---|
| `APP_NAME` | `Lagerbuch` | Produktname (Brand oben links, Manifest) |
| `APP_ORG` | `""` | Organisationszeile, z. B. `DRK Bereitschaft Musterstadt` |
| `APP_TAGLINE` | `Materialverwaltung` | Untertitel auf Gate/Login |
| `APP_BASE_URL` | – (Pflicht) | Absolute URL für OIDC-Callbacks und QR-Deep-Links |
| `DATABASE_PATH` | `/data/lagerbuch.db` | SQLite-Datei auf dem Volume |
| `TZ` | `Europe/Berlin` | Zeitstempel im Journal |
| `WARN_TAGE_KRITISCH` | `31` | Verfall-Ampel rot („läuft ab") |
| `WARN_TAGE_FAELLIG` | `56` | Verfall-Ampel gelb („bald fällig") |
| `BESTELL_FAKTOR` | `2` | Vorschlag = Faktor × Mindestbestand − Bestand |
| `HELFER_SESSION_STUNDEN` | `12` | Gültigkeit der Helfer-Session |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | – | Pocket ID |
| `OIDC_ADMIN_GROUP` | `lagerbuch-admin` | Erforderlicher Gruppen-Claim für die Verwaltung |
| `AUTH_SECRET` / `HELFER_SESSION_SECRET` | – | Signierschlüssel (generiert, siehe § 10) |

Damit ist dieselbe Image-Version für Staging, Produktion und – falls es je eine zweite Bereitschaft nutzen will – für fremde Instanzen einsetzbar.

---

## 5. Datenmodell

Grundprinzip aus dem Dummy, jetzt konsequent: **Bestand ist niemals eine Spalte, sondern immer die Summe der Buchungen.** Chargen tragen keine Menge; ihre Menge ergibt sich aus `SUM(buchungen.menge) WHERE charge_id = …`. Das Journal ist append-only und damit gleichzeitig Audit-Trail.

```ts
// src/db/schema.ts (Drizzle, gekürzt)
export const lagerorte = sqliteTable("lagerorte", {
  id: text("id").primaryKey(),                    // nanoid
  name: text("name").notNull(),                   // "Handlager", "RTW 1"
  typ: text("typ", { enum: ["lager", "fahrzeug"] }).notNull(),
  kennung: text("kennung"),                       // "XX-RK 100"
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
});

export const artikel = sqliteTable("artikel", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  einheit: text("einheit").notNull(),             // "Stk." | "Pkg." | "Fl." | "Box"
  fach: text("fach").notNull(),                   // Lagerplatz im Handlager, "A2"
  mindestbestand: integer("mindestbestand").notNull().default(0),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const chargen = sqliteTable("chargen", {
  id: text("id").primaryKey(),
  artikelId: text("artikel_id").notNull().references(() => artikel.id),
  chargenNr: text("chargen_nr").notNull(),
  verfall: text("verfall").notNull(),             // "YYYY-MM", Ablauf = Monatsende
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const buchungen = sqliteTable("buchungen", {
  id: text("id").primaryKey(),
  ts: integer("ts", { mode: "timestamp" }).notNull(),
  typ: text("typ", { enum: ["zugang", "entnahme", "korrektur"] }).notNull(),
  artikelId: text("artikel_id").notNull().references(() => artikel.id),
  chargeId: text("charge_id").notNull().references(() => chargen.id),
  lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
  menge: integer("menge").notNull(),              // signiert: Zugang +, Entnahme −
  quelleTyp: text("quelle_typ", { enum: ["token", "oidc", "system"] }).notNull(),
  quelleId: text("quelle_id").notNull(),          // Token-Code bzw. OIDC-sub
  referenz: text("referenz"),                     // z. B. "check:<id>"
  kommentar: text("kommentar"),
});

export const sollPositionen = sqliteTable("soll_positionen", {
  id: text("id").primaryKey(),
  fahrzeugId: text("fahrzeug_id").notNull().references(() => lagerorte.id),
  fachLabel: text("fach_label").notNull(),        // "Schrank 1 · Verbandmaterial"
  sort: integer("sort").notNull().default(0),
  artikelId: text("artikel_id").notNull().references(() => artikel.id),
  soll: integer("soll").notNull(),
});

export const tokens = sqliteTable("tokens", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),          // "831-042", s. § 6 zur Klartext-Entscheidung
  label: text("label").notNull(),
  scopeLagerortId: text("scope_lagerort_id").references(() => lagerorte.id), // null = alle
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  createdBy: text("created_by").notNull(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});

export const checks = sqliteTable("checks", {
  id: text("id").primaryKey(),
  fahrzeugId: text("fahrzeug_id").notNull().references(() => lagerorte.id),
  quelleTyp: text("quelle_typ").notNull(),
  quelleId: text("quelle_id").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  ergebnis: text("ergebnis"),                     // JSON: geprüfte Positionen + Ist
});

export const users = sqliteTable("users", {       // nur Verwaltung, via OIDC befüllt
  id: text("id").primaryKey(),                    // OIDC sub
  name: text("name"),
  email: text("email"),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
});
```

Ergänzend zwei SQLite-Trigger, die `UPDATE`/`DELETE` auf `buchungen` blockieren (`RAISE(ABORT, 'journal ist append-only')`) – Korrekturen sind neue Buchungen vom Typ `korrektur`. Indizes: `buchungen(artikel_id)`, `buchungen(charge_id)`, `buchungen(ts)`, `chargen(artikel_id, verfall)`, `soll_positionen(fahrzeug_id)`.

Der PRAGMA-Satz beim Start: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`.

---

## 6. Auth und Rollen

**Verwaltung (OIDC).** Auth.js v5 mit generischem OIDC-Provider gegen Pocket ID. Nach Login prüft der Callback den Gruppen-Claim `OIDC_ADMIN_GROUP`; ohne Gruppe → freundliche „kein Zugriff"-Seite. Beim ersten Login wird ein `users`-Datensatz angelegt (nur für lesbare Journal-Quellen und Sessions, sonst nichts). Alle `/verwaltung/*`-Routen und -Actions prüfen die Session serverseitig in der Middleware plus je Action.

**Helfer:innen (Token).** Ablauf: `GET /t/{code}` (QR im Fahrzeug / am Regal) oder manuelle Eingabe am Gate → Server prüft `tokens.aktiv`, setzt `lastUsedAt`, erstellt jose-signiertes httpOnly-Cookie (`SameSite=Lax`, `Secure`, TTL `HELFER_SESSION_STUNDEN`) und leitet auf `/helfer` bzw. das `returnTo`-Ziel (etwa `/a/{artikelId}`) weiter. Ein gesperrter Token invalidiert bestehende Sessions bei der nächsten Anfrage (Session enthält `tokenId`, der bei jeder schreibenden Aktion gegen die DB geprüft wird – bewusst der eine DB-Lookup pro Buchung, Sperren muss sofort wirken).

**Klartext-Codes – bewusste Entscheidung.** Die Codes hängen physisch laminiert im Fahrzeug; das Etikett *ist* das Secret. Sie müssen für Nachdrucke reproduzierbar sein, also stehen sie im Klartext in der DB. Kompensation: niedrige Berechtigung (nur entnehmen/checken), sofortige Sperrbarkeit, Rate-Limit auf die Code-Prüfung (5 Versuche/Minute/IP, In-Memory-Bucket), `lastUsedAt` sichtbar in der Verwaltung. Kein Personenbezug: Das Journal speichert den Token-Code, nie einen Namen – Datenschutz by Design, was die Einführung in der Bereitschaft erheblich vereinfacht (kurze Info an die Leitung genügt, keine Einwilligungen von Helfer:innen nötig).

**Deep-Link-Matrix:**

| URL | Zweck | Ohne Session |
|---|---|---|
| `/t/{code}` | Token einlösen | öffentlich (rate-limited) |
| `/a/{artikelId}` | Regaletikett → Entnahmeseite | Redirect zum Gate mit `returnTo` |
| `/helfer/**` | Helfer-UI | Redirect zum Gate |
| `/verwaltung/**` | Admin-UI | Redirect zu OIDC-Login |

---

## 7. Kernlogik (verbindliche Regeln)

Diese Regeln leben als pure Functions in `src/lib/domain/` – exakt die aus dem Klickdummy, jetzt mit Unit-Tests:

1. **Bestand** eines Artikels (Handlager) = `SUM(menge)` seiner Buchungen. Bestand einer Charge analog je `charge_id`. Es gibt keinen zweiten Wahrheitsspeicher.
2. **FEFO-Entnahme:** Entnahmemenge wird über Chargen mit Restbestand > 0 in aufsteigender Verfallsreihenfolge verteilt; pro betroffener Charge entsteht eine Buchungszeile. Ganze Verteilung in einer SQLite-Transaktion. Entnahme > Bestand wird serverseitig auf den Bestand gekappt (Antwort meldet die tatsächlich gebuchte Menge).
3. **Zugang** erfordert eine Charge: bestehende wählen oder neu anlegen (Chargen-Nr. + Verfall `YYYY-MM`). Für unkritisches Material ohne Verfall gibt es die Pseudo-Charge „ohne Verfall" (`verfall = '2099-12'`).
4. **Verfall-Ampel:** Ablauf = letzter Tag des Verfallsmonats. Resttage ≤ `WARN_TAGE_KRITISCH` → rot, ≤ `WARN_TAGE_FAELLIG` → gelb, sonst grün. Abgelaufene Chargen mit Restbestand erscheinen als eigene Aufgabe („aussondern" = Korrekturbuchung mit Kommentar).
5. **Bestellvorschlag:** Artikel mit Bestand < Mindestbestand; Menge = `BESTELL_FAKTOR × Mindestbestand − Bestand`. „Bestellt"-Markierung ist ein UI-Status (Tabelle `artikel.bestelltAt` nullable), der beim nächsten Zugang automatisch zurückgesetzt wird.
6. **Fahrzeug-Check:** Ist-Erfassung gegen `soll_positionen`; Abschluss erzeugt einen `checks`-Datensatz plus je Fehlmenge eine FEFO-Entnahme mit `referenz = "check:<id>"` – alles in einer Transaktion. Die Fehlliste zeigt das Handlager-Fach je Position.
7. **Inventur/Korrektur:** Gezählter Ist-Wert je Artikel; Differenz < 0 wird FEFO über Chargen verteilt, Differenz > 0 wird der jüngsten Charge (oder einer neu angelegten) zugebucht, jeweils `typ = korrektur` mit Pflicht-Kommentar.

---

## 8. Anwendungsstruktur

```
lagerbuch/
├─ src/
│  ├─ app/
│  │  ├─ (gate)/page.tsx              # Code-Eingabe + OIDC-Button
│  │  ├─ t/[code]/route.ts            # Token-Deep-Link
│  │  ├─ a/[artikelId]/page.tsx       # Regaletikett-Ziel (rolle-abhängig)
│  │  ├─ helfer/…                     # Entnahme, Check (mobile-first)
│  │  ├─ verwaltung/…                 # Übersicht, Artikel, Soll, Bestellung,
│  │  │                               # Journal, Zugänge, Etiketten, Inventur
│  │  ├─ api/health/route.ts
│  │  └─ manifest.webmanifest/route.ts
│  ├─ actions/                        # Server Actions (zod-validiert)
│  ├─ lib/domain/                     # fefo.ts, bestand.ts, verfall.ts, vorschlag.ts
│  ├─ lib/auth/                       # authjs.ts, helferSession.ts, rateLimit.ts
│  ├─ lib/config.ts
│  ├─ db/ (schema.ts, migrate.ts, seed.ts)
│  └─ components/                     # Plakette, Stepper, Chips … (aus Dummy portiert)
├─ drizzle/                           # generierte Migrationen (eingecheckt)
├─ e2e/                               # Playwright
├─ Dockerfile · compose.yaml · stack.env.example · generate-secrets.sh
└─ .github/workflows/ci.yaml
```

Migrationen laufen **beim Container-Start** programmatisch (`instrumentation.ts` → `migrate(db, { migrationsFolder })`), bevor der Server Anfragen annimmt. Dort startet auch der interne Backup-Job (§ 10). Ersterfassung: CSV-Import (Artikel + Startbestand als Korrekturbuchung) über die Verwaltung plus ein Inventur-Schnellerfassungsmodus – ohne bequeme Ersteingabe scheitert die Einführung, deshalb ist das Teil von M5, nicht Backlog.

**Etikettendruck:** `/verwaltung/etiketten` rendert wählbare Artikel/Token als Bogen (Print-CSS, 48,5 × 25,4 mm Raster für Standard-Klebeetiketten): QR (`APP_BASE_URL/a/{id}` bzw. `/t/{code}`) + Name + Fach in Barlow Condensed.

---

## 9. Dockerfile

`node:26-slim` (Debian) statt Alpine – better-sqlite3 liefert Prebuilds für linux-arm64/glibc, unter musl müsste kompiliert werden.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:26-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build                          # next build, output: "standalone"

FROM node:26-slim AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

---

## 10. Deployment: compose.yaml, stack.env, Secrets

Ein `compose.yaml` für Test **und** Produktion; der Unterschied liegt ausschließlich in `stack.env` je Portainer-Stack. Empfehlung: **Staging als Stack `lagerbuch-staging`** mit Tailscale-Domain `lagerbuch.staging.example` (nur du testest), **Produktion als Stack `lagerbuch`** mit `lagerbuch.example.com` (Helfer:innen scannen mit Privathandys, das muss öffentlich erreichbar sein). Laufen beide Stacks auf demselben Host, brauchen die Traefik-Router unterschiedliche Namen – daher steckt der Routername als statischer Wert im jeweiligen Stack (einzige bewusste Abweichung zwischen den beiden Stack-Definitionen) oder Staging läuft auf Host B, Produktion auf Host A, dann ist auch das identisch.

```yaml
# compose.yaml
services:
  lagerbuch:
    image: ghcr.io/OWNER/lagerbuch:${IMAGE_TAG}
    restart: unless-stopped
    environment:
      - TZ=Europe/Berlin
      - APP_NAME=${APP_NAME}
      - APP_ORG=${APP_ORG}
      - APP_TAGLINE=${APP_TAGLINE}
      - APP_BASE_URL=https://${DOMAIN}
      - DATABASE_PATH=/data/lagerbuch.db
      - AUTH_SECRET=${AUTH_SECRET}
      - HELFER_SESSION_SECRET=${HELFER_SESSION_SECRET}
      - OIDC_ISSUER=${OIDC_ISSUER}
      - OIDC_CLIENT_ID=${OIDC_CLIENT_ID}
      - OIDC_CLIENT_SECRET=${OIDC_CLIENT_SECRET}
      - OIDC_ADMIN_GROUP=lagerbuch-admin
    volumes:
      - lagerbuch_data:/data
    networks:
      - infrastructure
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.lagerbuch.rule=Host(`${DOMAIN}`)"
      - "traefik.http.routers.lagerbuch.entrypoints=websecure"
      - "traefik.http.routers.lagerbuch.tls=true"
      - "traefik.http.services.lagerbuch.loadbalancer.server.port=3000"

volumes:
  lagerbuch_data:

networks:
  infrastructure:
    external: true
```

```bash
# stack.env.example
# ── STATIC (je Stack anpassen) ─────────────────────────────
DOMAIN=lagerbuch.staging.example          # Prod: lagerbuch.example.com
IMAGE_TAG=edge                        # Prod: v1.x.y (nur getaggte Releases)
APP_NAME=Lagerbuch
APP_ORG=DRK Bereitschaft Musterstadt
APP_TAGLINE=Materialverwaltung

# ── GENERATED (generate-secrets.sh) ────────────────────────
AUTH_SECRET=__GENERATE__
HELFER_SESSION_SECRET=__GENERATE__

# ── MANUAL (Pocket ID: je Umgebung eigener OIDC-Client) ────
OIDC_ISSUER=https://id.example.com
OIDC_CLIENT_ID=__MANUAL__
OIDC_CLIENT_SECRET=__MANUAL__
```

`generate-secrets.sh` folgt dem bestehenden Template: ersetzt die beiden `__GENERATE__`-Platzhalter per `openssl rand -base64 48`, fragt die OIDC-Werte interaktiv ab (`prompt_secret`), schreibt `stack.env` (in `.gitignore`).

**Backups ohne Sidecar:** Der interne Job schreibt nächtlich um 02:30 per better-sqlite3-Backup-API einen konsistenten Snapshot nach `/data/backups/lagerbuch-YYYYMMDD.db` (Retention 14 Tage). Damit liegt im Volume immer eine kopierfähige Datei – die vorhandene Host-Sicherung nimmt sie ohne WAL-Konsistenzrisiko mit. Litestream-Replikation auf ein Off-Site-Ziel steht im Backlog, falls RPO < 24 h gewünscht wird.

**Rollout und Rollback:** Staging zieht `edge` (Portainer Re-Pull nach CI-Lauf), Produktion ausschließlich Semver-Tags. Rollback = `IMAGE_TAG` zurückdrehen; da Migrationen additiv gehalten werden (expand/contract), ist das gefahrlos. Vor jedem Prod-Update legt der Startprozess zusätzlich einen Migrations-Snapshot der DB an.

---

## 11. CI/CD

Repo unter dem eigenen GitHub-Account (public). Der CI-Workflow baut Multi-Arch (`linux/arm64` für den Server, `linux/amd64` für lokale Nutzung) auf GitHub-hosted Runnern per buildx – arm64 via QEMU-Emulation.

Workflow `ci.yaml`, drei Jobs:

1. **check** – `pnpm lint`, `pnpm typecheck`, `pnpm test` (Vitest), Drizzle-Migrationscheck (`drizzle-kit generate` darf keinen Diff erzeugen).
2. **e2e** – Image bauen, Container mit Wegwerf-DB starten, Playwright gegen `localhost` (drei Happy Paths, § 12).
3. **publish** – buildx-Push nach GHCR: `edge` + `sha-…` auf `main`, `vX.Y.Z` + `latest` bei Git-Tag. `linux/arm64` (Server) und `linux/amd64` (Kollegen/CI-Konsumenten) als Multi-Arch-Manifest.

Release-Fluss: Feature → `main` → automatisch auf Staging sichtbar → manuell Git-Tag → Prod-Stack auf neuen Tag stellen. Kein Auto-Deploy in Produktion; bei einem Ehrenamts-Tool ist der bewusste Handgriff ein Feature.

---

## 12. Teststrategie

**Unit (Vitest):** die Domain-Funktionen sind pur und billig zu testen – FEFO-Verteilung inkl. Kappung und Mehr-Chargen-Split, Bestandsaggregation, Verfall-Ampel an den Fenstergrenzen (31/56 Tage, Monatsende, Schaltjahr), Bestellvorschlag, Korrektur-Verteilungsregel. Ziel: jede Regel aus § 7 hat Testfälle, bevor UI daran hängt.

**Integration:** Actions gegen eine In-Memory-SQLite (`:memory:` + Migrationen): Buchung in Transaktion, Append-only-Trigger schlägt bei UPDATE an, Token-Sperre invalidiert Folgebuchung.

**E2E (Playwright, im CI gegen den echten Container):** (1) Gate → Token → Entnahme → Journalzeile mit Quelle `token:…`; (2) Verwaltung → Soll-Position ändern → Helfer-Check zeigt neue Sollmenge → Abschluss bucht Fehlmengen; (3) Zugang mit neuer Charge → Verfall-Ampel und Bestellliste reagieren.

Bewusst kein Coverage-Ziel als Zahl – die Domain-Schicht vollständig, der Rest über die drei Pfade, die die Bereitschaft täglich nutzt.

---

## 13. Meilensteine

Aufwände in Abenden (~2–3 h fokussiert); nach **M2 ist die App bereits täglich nützlich** – ab da liefert jeder weitere Meilenstein sichtbaren Mehrwert statt Vorleistung.

| # | Meilenstein | Inhalt | Definition of Done | Aufwand |
|---|---|---|---|---|
| M0 | Walking Skeleton | Repo, Next-Skeleton mit Config-Modul & Branding, Dockerfile, CI bis GHCR, Staging-Stack in Portainer | `https://lagerbuch.staging.example` liefert Gate-Seite mit `APP_ORG`-Branding, `/api/health` grün, Push auf `main` erneuert Staging | 2 |
| M1 | Datenkern + Verwaltung | Schema, Migrationen, Trigger; OIDC-Login; Artikel-CRUD, Zugang/Entnahme mit FEFO, Journal, Bestandsliste; CSV-Import | Lagerwart pflegt real erste 20 Artikel auf Staging; Journal korrekt; Unit-Tests § 7 grün | 3 |
| M2 | Helfer-Flow | Tokens (Verwaltung + Gate + `/t/`, `/a/`), Helfer-Entnahme mobil, Rate-Limit, Session-Invalidierung | Handy-Kamera-Scan eines Test-Etiketts → Entnahme in < 15 s; gesperrter Code kommt nicht mehr rein | 2 |
| M3 | Chargen & Verfall | Plakette/Ampel, Warnlisten, Dashboard-KPIs, „aussondern"-Flow | NaCl-Testcharge wandert bei Zeitreise-Test durch gelb/rot; Aussonderung erzeugt Korrekturbuchung | 1–2 |
| M4 | Soll & Fahrzeug-Check | Soll-Editor (Fahrzeuge/Fächer/Positionen), Check-Flow, Fehlliste, transaktionale Abbuchung, `checks`-Historie | Kompletter RTW-Check auf Staging; Fehlmengen korrekt abgebucht mit `referenz=check:…` | 2–3 |
| M5 | Bestellung & Inventur | Vorschlagsliste + Reset-bei-Zugang, CSV/Print-Export, Inventurmodus | Erstinventur-Probelauf mit realen Handlager-Daten | 1–2 |
| M6 | Etiketten & Go-Live | QR-Etikettenbögen, Backup-Job + Restore-Probe, Betriebs-README, Prod-Stack, Pocket-ID-Prod-Client, Einführungsabend | Etiketten hängen, Restore geprobt, Prod läuft unter eigener Domain, Bereitschaft eingewiesen | 2 |

Summe ≈ 13–16 Abende. Empfehlung zur Taktung: M0+M1 als ein Wochenendblock (der Schwung aus dem Dummy ist frisch), danach maximal zwei Abende pro Woche – das Projekt soll das Ehrenamt entlasten, nicht zum zweiten Job daneben werden. Nach M2 lohnt ein kurzer Zwischenstopp mit der Bereitschaftsleitung: echtes Feedback vom Handlager schlägt jede weitere Planung.

---

## 14. Risiken und offene Entscheidungen

| Thema | Einschätzung / Entscheidung nötig |
|---|---|
| **Produktions-Domain** | Start unter `lagerbuch.example.com` ist pragmatisch; mittelfristig klären, ob eine DRK-nahe Domain (CNAME) gewünscht ist – rein kosmetisch, kein Blocker. |
| **Freigabe Bereitschaftsleitung** | Kurzinfo vor M6: Zweck, keine personenbezogenen Helferdaten, Hosting-Verantwortung. Das anonyme Token-Design ist hier das stärkste Argument. |
| **Bus-Faktor** | Du bist Betreiber und Entwickler. Gegenmittel: Betriebs-README (Restore, Token neu, Stack-Update) so schreiben, dass ein zweiter I&K-Helfer es ausführen kann; Repo ggf. öffentlich (MIT) – wäre auch ein sauberer Blog-Case. |
| **Klartext-Token** | Akzeptiertes Restrisiko (§ 6); Review nach 3 Monaten Betrieb: reicht Sperren + Rate-Limit in der Praxis? |
| **SQLite-Grenzen** | Bei einer Bereitschaft irrelevant; sollte je Multi-Bereitschaft kommen → Postgres-Migration via Drizzle möglich, aber bewusst kein Design-Ziel. |
| **Scope Creep aus der Bereitschaft** | Wunschliste wird kommen (Geräteprüfungen! MPG! Fahrzeugbuch!). Regel: alles hinter M6 landet im Backlog und wird gegen den nächsten Zyklus priorisiert, nicht „mal eben" eingebaut. |

## 15. Backlog (bewusst nach V1)

PWA-Offline-Outbox für die Fahrzeughalle · In-App-Scanner (BarcodeDetector + zxing-Fallback) · Verbrauchsstatistik und daraus dynamische Bestellmengen statt Faustformel · Benachrichtigungen bei Unterschreitung/Verfall (ntfy oder Fastmail-SMTP) · Litestream-Replikation · Mehrere Lagerorte · Geräte-/Prüfungsverwaltung (MPBetreibV) als eigenes Modul · Extraktion als bluelight-hub-Modul, falls sich die Domänenmodelle decken.

---

*Anhang-Hinweis: Die UI-Spezifikation ist der Klickdummy v2 (`lagerbuch-klickdummy-v2.jsx`) – Komponenten, Wording und Flows werden von dort übernommen.*
