# Lagerbuch M4 — Soll & Fahrzeug-Check — Design-Spec

**Stand:** 2026-07-11 · **Scope:** Meilenstein M4 (Soll-Editor je Fahrzeug + Helfer-Fahrzeug-Check mit transaktionaler FEFO-Abbuchung der Fehlmengen + `checks`-Historie)

---

## 1. Kontext & Autorität

Maßgeblich: [`implementierungsplan.md`](../../../implementierungsplan.md) **§7 Regel 6** („Fahrzeug-Check: Ist-Erfassung gegen `soll_positionen`; Abschluss erzeugt einen `checks`-Datensatz plus je Fehlmenge eine FEFO-Entnahme mit `referenz='check:<id>'` – alles in einer Transaktion. Die Fehlliste zeigt das Handlager-Fach je Position.") und **§13 M4** (DoD: „Kompletter RTW-Check auf Staging; Fehlmengen korrekt abgebucht mit `referenz=check:…`"). UI-Referenz: `mockup.jsx` `HelferView` CheckScreen (Z. 447–512) + `checkAbbuchen` (Z. 369–376) + `SEED_FAHRZEUGE` (Z. 193–203). Baut auf M0–M3.

Schema existiert seit M1 (kein Change): `lagerorte(typ ∈ {lager,fahrzeug}, kennung)`, `sollPositionen(fahrzeugId, fachLabel, sort, artikelId, soll)`, `checks(fahrzeugId, quelleTyp, quelleId, startedAt, completedAt, ergebnis)`. Nur „Handlager" (lager) ist geseedet — **Fahrzeuge werden über die Verwaltung angelegt**.

---

## 2. Scope-Entscheidungen (bestätigt, nicht offen)

**Enthalten in M4:**
- **Fahrzeug-Verwaltung (Admin):** Fahrzeuge anlegen/listen (`lagerorte` `typ="fahrzeug"`, Name + Kennung, aktiv/inaktiv).
- **Soll-Editor (Admin):** `sollPositionen` je Fahrzeug pflegen — nach `fachLabel` gruppiert (Position = Artikel + Soll-Menge; hinzufügen/ändern/entfernen).
- **Fahrzeug-Check (Helfer/mobil):** der in M2 ausgelassene **zweite Helfer-Tab**. Fahrzeug wählen → Ist-Erfassung gegen Soll (checkcircle + Stepper) → Fehlliste (mit Handlager-Fach je Position) → Abschluss.
- **`checkAbschluss`-Action (Helfer):** EINE Transaktion → `checks`-Zeile → je Fehlmenge FEFO-Abbuchung aus dem Handlager mit `referenz="check:<id>"`; `ergebnis`-JSON. `quelleTyp="token"`, `quelleId=code`.
- **`checks`-Historie (Admin, read-only):** vergangene Checks je Fahrzeug (Zeitpunkt, Fehlmengen-Anzahl).
- **FEFO-Refactor:** transaktions-freier `fefoAbbuchung(tx, …)`-Kern, geteilt von Entnahme-Wrappern **und** `checkAbschluss`.

**Bewusst NICHT in M4 (verschoben/ausgelassen):**
- **Admin-Desktop-Check-UI** — der Check läuft am Fahrzeug per Handy (Helfer). Admin bekommt nur die Historie. Kein zweiter Check-Pfad.
- **Token-Scope-→-Fahrzeug-Vorauswahl** — `tokens.scopeLagerortId` bleibt gespeichert, aber ohne Scope-Picker; der Helfer **wählt das Fahrzeug aus einer Liste**. Spätere Politur.
- **Fahrzeug-Bestandsjournal** — Fahrzeuge haben nur ein Soll; der Check bucht **Handlager-Entnahmen** (Nachfüllen des Fahrzeugs *aus* dem Handlager → Journaleffekt = Handlager-Entnahmen, exakt „je Fehlmenge eine FEFO-Entnahme").
- **Mehrschritt-Check-Session** — Single-Shot-Submit; `startedAt` = `completedAt` = now.
- **Inventur/generisches Korrektur** → M5.

---

## 3. Bestätigte Präzisierungen (die entscheidenden Design-Calls)

### 3.1 Die Transaktion (Kern von M4)
- **`fefoAbbuchung(tx, { artikelId, menge, quelle, kommentar, referenz })` — transaktions-FREI**, läuft innerhalb einer bestehenden `tx`. Verteilt `menge` FEFO über die Chargen des Artikels, kappt am Bestand, je Charge eine `entnahme`-Buchung (jetzt mit `referenz`), gibt tatsächlich gebuchte Menge zurück.
- Liegt in **`src/db/abbuchung.ts`** (NICHT in `buchung.ts` — das ist `"use server"` und client-importiert, darf also nur async exportieren; ein sync-Helfer dort bräche den Build).
- **`bucheEntnahme` / `bucheEntnahmeHelfer`** öffnen je EINE `db.transaction((tx) => …)` und rufen `fefoAbbuchung(tx, {…, referenz: null})`. Das alte `entnehmenCore` entfällt. Bestehende Entnahme-Tests bleiben grün.
- **`checkAbschluss`** öffnet EINE Transaktion → `insert(checks)` (id) → **Schleife über Fehlmengen**, je `fefoAbbuchung(tx, {…, referenz: "check:"+id})`. **NIEMALS** die Entnahme-*Actions* oder einen transaktions-öffnenden Kern je Fehlmenge aufrufen (das bräche Atomarität, Referenz-Reihenfolge und liefe Auth/revalidate je Iteration).
- **Kappung gratis durch Reuse:** die tatsächlich gebuchte Menge je Position wird in `ergebnis` festgehalten (`gebucht` kann < `fehlt` sein, wenn der Handlager-Bestand nicht reicht → in der UI sichtbar „nur X im Lager").

### 3.2 Check-Domäne & Ergebnis
- Pure `fehlmengen(positionen: {artikelId, soll, ist}[]) → {artikelId, soll, ist, fehlt}[]` mit `fehlt = max(0, soll - ist)`, nur `fehlt > 0`.
- `checks.ergebnis` = JSON-String eines Arrays `[{ artikelId, soll, ist, fehlt, gebucht }]` (alle geprüften Positionen).
- `startedAt = completedAt = new Date()`.

### 3.3 Gating & Quellen
- `checkAbschluss`: `requireHelfer` → `checks.quelleTyp="token"`, `quelleId=code`; die FEFO-Buchungen ebenso `quelleTyp="token"`, `quelleId=code`, `referenz="check:<id>"`.
- Fahrzeug-CRUD, Soll-Editor, `checks`-Historie: `requireAdmin`.
- Fehlliste zeigt je Position das **Handlager-Fach** (`artikel.fach`) für die Packliste.

### 3.4 Helfer-Frame
- `HelferFrame` bekommt eine echte **2-Tab-Nav**: „Entnahme" (`/helfer`) + „Fahrzeug-Check" (`/helfer/check`), aktiver Tab per `activeTab`-Prop. `/a/{id}` (Detail) und `/helfer` reichen `activeTab="entnahme"`; `/helfer/check` reicht `"check"`.

---

## 4. Deliverables (M4)

1. **FEFO-Refactor:** `src/db/abbuchung.ts` (`fefoAbbuchung` + `Tx`-Typ) + `buchung.ts` auf tx+`fefoAbbuchung` umgestellt (referenz=null). Tests: bestehende Entnahme grün, referenz null bei normaler Entnahme.
2. **Fahrzeug + Soll Server-Layer:** Actions `createFahrzeug`, `setFahrzeugAktiv`, `sollPositionSetzen` (upsert), `sollPositionEntfernen`; Queries `fahrzeugListe`, `sollFuerFahrzeug` (gruppiert nach Fach, mit Artikelname/-einheit/-Handlagerfach). Tests.
3. **`checkAbschluss`-Action + `fehlmengen`-Domäne:** eine Transaktion, `checks`-Zeile + FEFO je Fehlmenge mit `referenz`, `ergebnis`-JSON. Integrationstests (Fehlmenge → entnahme mit `referenz=check:<id>`; checks-Zeile; ergebnis; Kappung sichtbar).
4. **Fahrzeug-Verwaltung-UI (Admin):** `/verwaltung/fahrzeuge` (Liste + anlegen) + SideNav-Eintrag „Fahrzeuge".
5. **Soll-Editor-UI (Admin):** je Fahrzeug Positionen nach Fach gruppiert pflegen (Artikel wählen, Soll, Fach, hinzufügen/ändern/entfernen).
6. **HelferFrame 2-Tab** + Wiring (`activeTab` in `/helfer`, `/a/[id]`, `/helfer/check`).
7. **Helfer-Check-UI:** `/helfer/check` — Fahrzeug wählen → Ist-Erfassung (checkcircle/Stepper) → Fehlliste (Handlager-Fach) → Abschluss (`checkAbschluss`).
8. **`checks`-Historie (Admin):** Liste vergangener Checks je Fahrzeug (Zeitpunkt, Fehlmengen-Anzahl aus `ergebnis`).
9. **e2e:** Token einlösen → Check-Tab → Fahrzeug wählen → Ist < Soll erfassen → Abschluss → Journal zeigt `entnahme` mit `referenz=check:<id>`; Historie zeigt den Check.

---

## 5. Definition of Done (M4)

**Lokal verifizierbar (`mise run dev` + Vitest):**
- Admin legt ein Fahrzeug an und pflegt Soll-Positionen (Fächer, Artikel, Soll).
- Helfer (Token) öffnet den Check-Tab, wählt das Fahrzeug, erfasst Ist-Mengen; die Fehlliste zeigt je Fehlposition Menge + Handlager-Fach.
- Abschluss erzeugt genau eine `checks`-Zeile **und** je Fehlmenge eine FEFO-`entnahme` mit `referenz="check:<checkId>"` — **alles in einer Transaktion** (schlägt eine Buchung fehl, wird nichts geschrieben).
- Bestand des Handlagers sinkt um die abgebuchten Fehlmengen; übersteigt eine Fehlmenge den Handlager-Bestand, wird gekappt und die tatsächliche Menge in `ergebnis.gebucht` festgehalten.
- Admin sieht den Check in der Historie.
- Alle Unit-/Integration-/e2e-Tests grün; `typecheck`/`lint`/`build` grün.

---

## 6. Tests (im Plan namentlich zu verankern)

- **`fefoAbbuchung`**: verteilt FEFO in einer übergebenen tx, setzt `referenz`, kappt; bestehende `bucheEntnahme`/`bucheEntnahmeHelfer`-Tests bleiben grün; normale Entnahme hat `referenz=null`.
- **`fehlmengen`**: `fehlt=max(0,soll-ist)`, nur >0; Ist≥Soll → keine Fehlmenge.
- **`checkAbschluss`**: eine `checks`-Zeile; je Fehlmenge eine `entnahme` mit `referenz="check:<id>"` und `quelleTyp=token`; `ergebnis`-JSON korrekt (soll/ist/fehlt/gebucht); Kappung bei zu wenig Handlager-Bestand (`gebucht<fehlt`); keine Fehlmenge → keine Buchung, aber `checks`-Zeile existiert; Atomarität (alles-oder-nichts).
- **Fahrzeug/Soll**: `createFahrzeug` legt `typ=fahrzeug` an; `sollPositionSetzen` upsert; `sollFuerFahrzeug` gruppiert korrekt mit Artikel-Handlagerfach.
- **e2e**: Check-Flow → Journal `referenz=check:…` + Historie.

---

## 7. Ausführung

Autonom (Auto-Modus, keine Rückfragen): Ultracode-Workflow (~9 Tasks, test-first, Per-Task-Review + adversarialer Whole-Branch-Review + Fix-Wave), Branch `m4-soll-fahrzeug-check`, Stall-Wächter re-armed. Bei Grün **lokal in `main` mergen**, **kein Push** (Deploy bleibt separat gegatet).
