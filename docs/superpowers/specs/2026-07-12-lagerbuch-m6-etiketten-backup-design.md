# Lagerbuch M6 — Etiketten & Backup — Design-Spec

**Stand:** 2026-07-12 · **Scope (Code-Teil von §13 M6):** QR-Etikettendruck + interner Backup-Job. Der operative Go-Live (Restore-Probe, Prod-Stack, Pocket-ID-Prod, Einführung, Public-Repo + Push) bleibt **User-Gate**.

---

## 1. Kontext & Autorität

Maßgeblich: [`implementierungsplan.md`](../../../implementierungsplan.md) **§8 Etikettendruck** („`/verwaltung/etiketten` rendert wählbare Artikel/Token als Bogen (Print-CSS, 48,5 × 25,4 mm Raster): QR (`APP_BASE_URL/a/{id}` bzw. `/t/{code}`) + Name + Fach in Barlow Condensed"), **§10** („interner Job schreibt nächtlich um 02:30 per better-sqlite3-Backup-API einen Snapshot nach `/data/backups/lagerbuch-YYYYMMDD.db`, Retention 14 Tage") und **§13 M6**. Baut auf M0–M5.

Vorhanden: `getSqlite(): Database.Database` (rohes Handle, `.backup()`), `register()` in `src/instrumentation.ts` (nodejs-Startup), `config.databasePath`/`config.appBaseUrl`, Barlow Condensed als `--display`-Font. `qrcode` ist **nicht** installiert; der Backup-Job ist **nicht** implementiert.

---

## 2. Scope-Entscheidungen (bestätigt, nicht offen)

**Enthalten in M6 (Code):**
- **Etikettendruck** (`/verwaltung/etiketten`, Admin): wählbare aktive Artikel + aktive Token als Etikettenbogen; je Etikett QR (absoluter Deep-Link) + Name + Fach/Label; Print-CSS für 48,5 × 25,4 mm; Auswahl per Checkbox + Drucken-Button (`window.print()`), keine Server-Roundtrips.
- **Backup-Job** (§10): interner, guardrail-gesicherter Job, der stündlich prüft und um ~02:xx einen konsistenten Snapshot nach `<dirname(databasePath)>/backups/lagerbuch-YYYYMMDD.db` schreibt, Retention 14 Tage.

**Bewusst NICHT in M6 (Go-Live = User-Gate):**
- Restore-Probe (manuell/operativ), Prod-Stack, Pocket-ID-Prod-Client, Betriebs-README-Erweiterung über das Vorhandene hinaus, Einführungsabend, **das Anlegen/Pushen des Public-Repos** (Deploy).
- Litestream/Off-Site-Replikation → Backlog.
- In-App-QR-Scanner → Backlog (Deep-Links genügen).

---

## 3. Bestätigte Präzisierungen (die entscheidenden Design-Calls)

### 3.1 Backup-Job — darf den Startup strukturell NICHT brechen
- Liegt in `src/db/backup.ts`; `starteBackupJob()` wird in `register()` (`instrumentation.ts`) nur bei `NEXT_RUNTIME==="nodejs"` **und** `nodeEnv==="production"` aufgerufen (in Dev übersprungen — sichert ein Prod-Volume).
- **Registrierung UND jeder Tick in try/catch** (loggen, schlucken) — `instrumentation.ts` muss booten, selbst wenn Backups kaputt sind.
- **KEIN Präzis-02:30-Scheduler.** Stattdessen idempotent: stündlicher `setInterval`, der einen Snapshot nur ausführt, wenn lokale Stunde `=== 2` **und** für heute noch keine Datei existiert. Robust gegen Neustart/Drift/Doppel-Feuern.
- **Getestet wird nur die pure Fläche:** `backupDateiname(now) → "lagerbuch-YYYYMMDD.db"` und `veralteteBackups(dateien, now, retentionTage) → string[]` (welche > Retention alt sind). **Nicht** Timer oder echtes `.backup()`.

### 3.2 Etikettendruck
- **QR serverseitig** in der async Page/Query: `QRCode.toDataURL(text)` → PNG-Data-URI im `<img>`. `text` = **absoluter** Deep-Link `${config.appBaseUrl}/a/${id}` bzw. `${config.appBaseUrl}/t/${code}` (die Handy-Kamera löst ihn eigenständig auf — daher ist `APP_BASE_URL` Pflicht). `qrcode` ist server-only, nie in Edge/Client importieren.
- **Auswahl ohne Roundtrip:** Server rendert QR für alle aktiven Artikel + aktiven Token; ein Client-Wrapper hält die Auswahl (Checkboxen, Default alle), abgewählte Etiketten bekommen eine Klasse; ein „Drucken"-Button ruft `window.print()`.
- **Print-CSS** ist der fummelige Teil (in `globals.css`): `@page { margin }`, feste `48,5 mm × 25,4 mm`-Zellen im Grid; `@media print` blendet App-Chrome (SideNav, Topbar, Steuerleiste) **und** abgewählte Etiketten aus.
- Admin-gated (`requireAdmin`), SideNav-Eintrag „Etiketten", Barlow Condensed (`--display`).

---

## 4. Deliverables (M6)

1. **Backup-Job** (`src/db/backup.ts`: `backupDateiname`, `veralteteBackups`, `starteBackupJob`) + Wiring in `src/instrumentation.ts` (guarded) + Tests (pure Fläche).
2. **`qrcode`-Dep + `etikettenDaten`** (`pnpm add qrcode @types/qrcode`; `src/db/etiketten.ts` async: aktive Artikel + aktive Token mit absolutem Deep-Link + QR-Data-URI) + Test.
3. **Etiketten-UI** (`/verwaltung/etiketten/page.tsx` async + `EtikettenBogen.tsx` Client-Auswahl + Print-CSS in `globals.css` + SideNav „Etiketten").
4. **e2e** (`e2e/etiketten.spec.ts`): `/verwaltung/etiketten` rendert ein QR-`<img>` für einen geseedeten Artikel (Proxy für „Etiketten hängen").

---

## 5. Definition of Done (M6)

**Lokal verifizierbar (`mise run dev` + Vitest):**
- `/verwaltung/etiketten` zeigt je aktivem Artikel und Token ein Etikett mit scanbarem QR (absoluter Deep-Link `/a/{id}` bzw. `/t/{code}`), Name + Fach/Label; Auswahl per Checkbox; „Drucken" öffnet den Druckdialog; im Druckbild erscheinen nur gewählte Etiketten, ohne App-Chrome, im 48,5 × 25,4 mm-Raster.
- `backupDateiname`/`veralteteBackups` unit-getestet; `starteBackupJob` bricht den Startup unter keinen Umständen (try/catch, Dev-Skip) — durch Lesen verifiziert.
- Alle Unit-/Integration-/e2e-Tests grün; `typecheck`/`lint`/`build` grün.
- **Schlussgate:** die **volle Playwright-Suite** läuft einmal komplett grün (nicht nur der neue Spec).

---

## 6. Tests (im Plan namentlich zu verankern)

- **`backupDateiname`**: `new Date(2026,6,3)` → `"lagerbuch-20260703.db"` (Nullpad).
- **`veralteteBackups`**: aus einer Liste mit gemischten Daten die > `retentionTage` alten korrekt selektieren; nicht-passende Dateinamen ignorieren.
- **`etikettenDaten`**: liefert aktive Artikel + Token mit `url = ${appBaseUrl}/a/${id}` bzw. `/t/${code}` und `qr` als `data:image/png…`-URI; inaktive ausgeschlossen.
- **e2e**: Etiketten-Seite rendert QR-`<img>` für den geseedeten Artikel.

---

## 7. Ausführung & Abschluss

Autonom (Auto-Modus): Ultracode-Workflow (~4 Tasks, test-first, Per-Task-Review + adversarialer Whole-Branch-Review + Fix-Wave), Branch `m6-etiketten-backup`, Stall-Wächter re-armed. Bei Grün **lokal in `main` mergen**, **kein Push**. **Danach: volle Playwright-Suite einmal komplett** als Schlussgate, dann „M0–M6 code-complete, bereit zum Deploy auf User-Kommando" melden.
