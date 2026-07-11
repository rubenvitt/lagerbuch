# Lagerbuch M3 — Chargen & Verfall — Design-Spec

**Stand:** 2026-07-11 · **Scope dieses Durchlaufs:** Meilenstein M3 (Verfall-Warnlisten, Dashboard-KPIs, „aussondern"-Flow)

---

## 1. Kontext & Autorität

Maßgeblich bleibt [`implementierungsplan.md`](../../../implementierungsplan.md) — **§7 Regel 4** (Verfall-Ampel: Ablauf = Monatsende; ≤ `WARN_TAGE_KRITISCH` rot, ≤ `WARN_TAGE_FAELLIG` gelb, sonst grün; „Abgelaufene Chargen mit Restbestand erscheinen als eigene Aufgabe — 'aussondern' = Korrekturbuchung mit Kommentar") und **§13** (M3-DoD: „NaCl-Testcharge wandert bei Zeitreise-Test durch gelb/rot; Aussonderung erzeugt Korrekturbuchung"). Baut auf M0–M2 auf.

**Dieses Dokument dupliziert den Plan nicht** — es pinnt die M3-Entscheidungen und die Abnahmekriterien und ist bei Konflikt maßgeblich.

Die Domänenlogik existiert bereits (M1): `verfallStatus(verfall, {kritisch,faellig}, now) → {ampel, tage, abgelaufen}` in `src/lib/domain/verfall.ts`, plus `chargeText`/`chipTone` in `src/lib/format.ts` und die `Plakette`-Komponente. **M3 baut Query + Action + UI darauf, keine neue Domänenregel, kein Schema-Change** (`korrektur`-Buchungstyp existiert seit M1).

---

## 2. Scope-Entscheidungen (bestätigt, nicht offen)

**Enthalten in M3:**
- **Verfall-Warnliste** (`/verwaltung/verfall`): charge-zentrische Liste aller Chargen mit `rest > 0`, die **nicht grün** sind, gruppiert nach *Abgelaufen (aussondern nötig)* / *Kritisch (rot, läuft ab)* / *Bald fällig (gelb)*, je mit `Plakette` + Artikel-Kontext.
- **„aussondern"-Flow**: Server-Action, die für eine **abgelaufene** Charge mit `rest > 0` eine `korrektur`-Buchung `menge = -rest` schreibt (Pflicht-Kommentar). Bucht die abgelaufene Menge aus dem Bestand aus.
- **Dashboard-KPIs**: Aufsplittung der bisherigen kombinierten Chargen-KPI in **„bald fällig / kritisch"** (gelb/rot, nicht abgelaufen) und **„abgelaufen — aussondern nötig"**; Verfall-Seite von der Übersicht verlinkt.
- **Zeitreise-Unit-Test** (DoD): eine Charge fixen Verfalls wandert bei fortschreitendem `now` durch grün → gelb → rot → abgelaufen.

**Bewusst NICHT in M3 (verschoben/ausgelassen):**
- **Generisches Abschreiben** beliebiger Chargen „mit Begründung" (beschädigt etc.) → das ist der **M5-Inventur/Korrektur-Flow** (§7 Regel 7). `aussondern` bleibt bewusst auf **abgelaufene** Chargen beschränkt (§7 Regel 4), um eine Überschneidung mit M5 zu vermeiden.
- **Benachrichtigungen** (E-Mail/ntfy bei Verfall/Unterschreitung) → Backlog.
- **Fahrzeug-Check / Soll** → M4.
- **Aussondern-Button im M1b-`ArtikelDrawer`** → optionales Polish, in M3 **ausgelassen** (Warnliste ist die mandatierte Fläche; kein Diff-Ballooning). Kann später ergänzt werden.

---

## 3. Bestätigte Präzisierungen (die entscheidenden Design-Calls)

### 3.1 `aussondern` — Einzelcharge-Korrektur, NICHT FEFO
- **Nicht** `entnehmenCore` wiederverwenden. FEFO verteilt über mehrere Chargen; `aussondern` zielt auf **genau eine** `chargeId` und bucht exakt `-rest` für sie. Shape wie `bucheZugang` (Charge laden → `artikelId` daraus ableiten → eine Buchung).
- **`rest` in der Transaktion berechnen** (`bestandProCharge`), auf `rest > 0` gaten.
- **`abgelaufen === true` serverseitig neu berechnen** (`verfallStatus(charge.verfall, opts, new Date()).abgelaufen`) — Client-Angaben nicht vertrauen. Eine rote-aber-nicht-abgelaufene Charge ist noch nutzbar (FEFO verbraucht sie zuerst) → **nicht** aussonderbar.
- **`artikelId` aus der geladenen Charge**, nicht aus dem Request (Phantom-Schutz, analog M2-Zugang-Fix).
- **Pflicht-`kommentar`** (nicht leer, getrimmt).
- Buchung: `typ:"korrektur"`, `menge:-rest`, `quelleTyp:"oidc"`, `quelleId:userId`, `lagerortId:HANDLAGER_ID`, `chargeId`, `artikelId`, `kommentar`.
- **`bestelltAt` NICHT zurücksetzen** (das ist zugang-only). Bestand sinkt → KPIs/Bestellvorschlag aktualisieren sich automatisch über die `SUM(menge)`-Invariante.

### 3.2 Warnliste-Query
- `verfallListe(db)` liefert charge-zentrische Einträge: nur `rest > 0` **und** `ampel !== "gruen"` (schließt die Pseudo-Charge `2099-12` naturgemäß aus — plus expliziter Test dagegen).
- Je Eintrag: `chargeId, chargenNr, verfall, rest, ampel, abgelaufen, text` (aus `chargeText`) + Artikel-Kontext `artikelId, artikelName, einheit, fach`.
- Sortierung: **dringlichste zuerst** — abgelaufene vor kritisch vor fällig; innerhalb nach `verfall` aufsteigend (bzw. `tage` aufsteigend).

### 3.3 KPI-Split (`kennzahlen`)
- Bestehende `chargenKritisch` zählte bisher **alle** nicht-grünen Chargen mit `rest > 0` (inkl. abgelaufener, da abgelaufen → rot). **Neu:**
  - `chargenKritisch` = `rest > 0`, `ampel ∈ {gelb, rot}`, **`abgelaufen === false`** (bald fällig / läuft ab).
  - `chargenAbgelaufen` = `rest > 0`, `abgelaufen === true`.
- Die beiden zählen disjunkt (kein Doppelzählen). **Die bestehende `queries.test.ts`-Assertion für `chargenKritisch` wird bewusst angepasst** (nicht stillschweigend übergangen).
- Übersicht und Verfall-Seite nutzen **dieselben** `opts = {kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig}` → nie widersprüchlich.

---

## 4. Deliverables (M3)

1. **Zeitreise-Test** (`src/lib/domain/verfall.test.ts`): eine Charge (z. B. `verfall` 2 Monate voraus) via fortschreitendem `now` durch grün → gelb → rot → abgelaufen; prüft die 56/31/0-Tage-Grenzen. (Domänenregel existiert, Test ist neu — erfüllt DoD.)
2. **`verfallListe`-Query** (`src/db/queries.ts` + `queries.test.ts`): charge-zentrische Warnliste (§3.2), Pseudo-Charge-Ausschluss-Test.
3. **`kennzahlen`-Split** (`src/db/queries.ts` + `queries.test.ts`): `chargenAbgelaufen` neu, `chargenKritisch` ohne abgelaufene; bestehende Assertion angepasst.
4. **`aussondern`-Action** (`src/actions/aussondern.ts` + `aussondern.test.ts`): §3.1. Tests: bucht `-rest` korrektur; lehnt `rest = 0`, leeren Kommentar, nicht-abgelaufene Charge, unbekannte Charge und die Pseudo-Charge `2099-12` ab.
5. **Verfall-Warnliste-Seite** (`src/app/verwaltung/(admin)/verfall/page.tsx` + `AussondernRow.tsx`) + **SideNav-Eintrag „Verfall"**: gruppierte Liste mit `Plakette`/Chips; abgelaufene Zeilen haben eine „Aussondern"-Aktion mit Pflicht-Kommentar-Feld.
6. **Übersicht-KPI-Erweiterung** (`src/app/verwaltung/(admin)/page.tsx`): zweite Chargen-Kachel „abgelaufen — aussondern nötig" (Ton rot bei > 0), Verlinkung zur Verfall-Seite.
7. **e2e** (`e2e/verfall.spec.ts`): abgelaufene Test-Charge → Verfall-Seite zeigt sie unter „Abgelaufen" → aussondern mit Kommentar → Journal zeigt `korrektur`-Zeile, Charge verschwindet aus der Warnliste, KPI sinkt.

---

## 5. Definition of Done (M3)

**Lokal verifizierbar (durch mich, `mise run dev` + Vitest):**
- Zeitreise-Unit-Test grün: Charge durchläuft grün → gelb → rot → abgelaufen an den konfigurierten Grenzen.
- Verfall-Seite listet nur Chargen mit `rest > 0`, die nicht grün sind; Pseudo-Charge `2099-12` erscheint nie.
- `aussondern` einer abgelaufenen Charge erzeugt eine `korrektur`-Buchung `menge = -rest` mit Pflicht-Kommentar; Bestand des Artikels sinkt um `rest`; die Charge fällt aus der Warnliste; nicht-abgelaufene Chargen sind nicht aussonderbar.
- Übersicht zeigt getrennte KPIs „bald fällig / kritisch" und „abgelaufen — aussondern nötig"; letztere sinkt nach dem Aussondern.
- Alle Unit-/Integration-/e2e-Tests grün; `pnpm typecheck`/`lint`/`build` grün.

---

## 6. Tests (im Plan namentlich zu verankern)

- **Zeitreise** (verfall.test.ts): grün→gelb→rot→abgelaufen an 56/31/0-Tage-Grenzen (`now` injiziert).
- **`verfallListe`**: nur rest>0 & nicht-grün; Sortierung abgelaufen→rot→gelb; Artikel-Kontext korrekt; **Pseudo-Charge `2099-12` nie enthalten**.
- **`kennzahlen`**: `chargenAbgelaufen` zählt abgelaufene rest>0; `chargenKritisch` zählt gelb/rot **ohne** abgelaufene; disjunkt.
- **`aussondern`**: bucht `-rest` korrektur (Bestand → 0 für die Charge); Pflicht-Kommentar erzwungen; `rest=0` abgelehnt; nicht-abgelaufene Charge abgelehnt; unbekannte Charge abgelehnt; Pseudo-Charge `2099-12` (immer grün, nie abgelaufen) abgelehnt; `bestelltAt` unverändert.
- **e2e**: abgelaufen → Verfall-Seite → aussondern → Journal-Korrektur + KPI/Warnliste aktualisiert.

---

## 7. Ausführung

Autonom (Auto-Modus, keine Rückfragen): Ultracode-Workflow (≈6 Tasks, test-first, Per-Task-Review + adversarialer Whole-Branch-Review + Fix-Wave), Branch `m3-chargen-verfall`, Stall-Wächter re-armed. Bei Grün **lokal in `main` mergen** (Auto-Modus autorisiert das), **kein Push** (Deploy bleibt separates, explizit gegateter Schritt).
