# Lagerbuch M5 — Bestellung & Inventur — Design-Spec

**Stand:** 2026-07-12 · **Scope:** Meilenstein M5 (Bestellvorschlag-Liste + Export, Inventurmodus mit Korrekturbuchungen)

---

## 1. Kontext & Autorität

Maßgeblich: [`implementierungsplan.md`](../../../implementierungsplan.md) **§7 Regel 5** (Bestellvorschlag: Bestand < Mindestbestand; Menge = `BESTELL_FAKTOR × Mindestbestand − Bestand`; „bestellt" = `artikel.bestelltAt`, Reset beim nächsten Zugang) und **§7 Regel 7** (Inventur/Korrektur: gezählter Ist je Artikel; Diff < 0 → FEFO über Chargen; Diff > 0 → jüngste Charge (oder neu); `typ=korrektur` mit Pflicht-Kommentar) sowie **§13 M5** (DoD: „Erstinventur-Probelauf mit realen Handlager-Daten"). Baut auf M0–M4.

Vorhanden aus M1: Domain `vorschlag.ts` (`braucht`, `vorschlagsmenge`), `artikel.bestelltAt` + dessen Reset in `bucheZugang`. Aus M4: `fefoAbbuchung(tx, …)` in `src/db/abbuchung.ts`. **Kein Schema-Change** — `buchungen.typ` kennt `"korrektur"`; **§5 hat keine Inventur-Tabelle** (das Journal + Kommentar sind der Nachweis).

---

## 2. Scope-Entscheidungen (bestätigt, nicht offen)

**Enthalten in M5:**
- **Bestellvorschlag-Seite** (`/verwaltung/bestellung`): Artikel unter Mindestbestand mit Vorschlagsmenge; „als bestellt markieren"-Umschalter (`bestelltAt`); **Export** = Copy-to-Clipboard + CSV-Download.
- **Inventurmodus** (`/verwaltung/inventur`): gezählten Ist-Wert je Artikel erfassen → Abschluss bucht je abweichender Position eine `korrektur` (Pflicht-Kommentar), sodass **Bestand = Ist**.
- **`fefoAbbuchung`-Erweiterung:** neuer `typ`-Param (`"entnahme" | "korrektur"`, Default `"entnahme"`), damit der Negativ-Diff der Inventur den geteilten FEFO-Kern nutzt.

**Bewusst NICHT in M5 (verschoben/ausgelassen):**
- **Print-Stylesheet / QR** → M6 (Etiketten). Export bleibt Copy + CSV.
- **Inventur-/Session-Tabelle** — es gibt keine; Journal + Pflicht-Kommentar (+ optionale `referenz`) sind der Nachweis.
- **Dynamische Bestellmengen aus Verbrauch** → Backlog. Vorschlag bleibt die Faustformel.

---

## 3. Bestätigte Präzisierungen (die entscheidenden Design-Calls)

### 3.1 Inventur — Korrekturbuchung je Position (§7 Regel 7)
`inventurKorrektur({ kommentar, positionen: {artikelId, ist}[] })`, `requireAdmin`, Pflicht-`kommentar`, **eine Transaktion**:
- Je Position: `bestandJetzt = SUM(buchungen[artikel])`, `diff = ist − bestandJetzt`.
- **`diff === 0` → überspringen** (keine Buchung; unterstützt Teil-Inventur).
- **`diff < 0` → `fefoAbbuchung(tx, { artikelId, menge: −diff, typ: "korrektur", quelle: oidc/userId, kommentar, referenz })`.** FEFO-Semantik ist korrekt (bei gezähltem Fehlbestand ist unbekannt, welche Charge verloren ging → älteste zuerst). **Kein paralleler FEFO-Loop.** Keine Kappung möglich, da `−diff = bestand − ist ≤ bestand`.
- **`diff > 0` → +diff auf die JÜNGSTE EXISTIERENDE Charge** (max `verfall`, Tiebreak neuestes `createdAt`), `typ=korrektur`. **Neue Charge nur, wenn der Artikel gar keine Charge hat** (dann `chargenNr="Inventur"`, `verfall="2099-12"`). **Nicht** über den FEFO-Helfer (der ist earliest-first — falsche Richtung).
- **`referenz="inventur:<synthetische-id>"`** gruppiert die Session im Journal (optional, aber gewünscht — ein `newId()` je Abschluss).
- **`bestelltAt` bleibt unverändert** (nur ein echter `zugang` setzt es zurück — §7 Regel 5 wörtlich; eine Inventur ist keine Lieferung).

### 3.2 Die Invariante (DoD-Anker)
**Nach `inventurKorrektur` gilt für jede korrigierte Position exakt `bestand(artikel) === ist`** — über alle Fälle: `ist<bestand` (über mehrere Chargen verteilt), `ist>bestand`, `ist==bestand` (No-op), und `ist>0` bei artikel ohne Charge (neue Charge). Diese Gleichheit ist der zentrale Test.

### 3.3 Bestellvorschlag
`bestellvorschlag(db)` = aktive Artikel mit `braucht(bestand, mindestbestand)`, je mit `vorschlag = vorschlagsmenge(bestand, mindestbestand, config.bestellFaktor)` und `bestellt = Boolean(bestelltAt)`. `markiereBestellt({artikelId, bestellt})` setzt `bestelltAt = bestellt ? now : null`, `requireAdmin`. Der Reset-bei-Zugang existiert bereits in `bucheZugang` — **nicht neu bauen, nur nutzen**.

---

## 4. Deliverables (M5)

1. **`fefoAbbuchung`-`typ`-Param** (`src/db/abbuchung.ts`) + Test (korrektur-Typ; die 3 bestehenden Aufrufer unverändert grün).
2. **Bestellvorschlag-Query + `markiereBestellt`-Action** (`src/db/queries.ts` `bestellvorschlag`; `src/actions/bestellung.ts`) + Tests.
3. **`inventurKorrektur`-Action** (`src/actions/inventur.ts`) + Tests (v. a. die `bestand===ist`-Invariante über alle Fälle).
4. **Bestellvorschlag-UI** (`/verwaltung/bestellung` + Client-Toggle + Export Copy/CSV) + SideNav „Bestellung".
5. **Inventur-UI** (`/verwaltung/inventur` + Client-Erfassung: Ist je Artikel, Pflicht-Kommentar, Abschluss) + SideNav „Inventur".
6. **e2e** (`e2e/inventur.spec.ts`): Ist ≠ Bestand erfassen → Abschluss → Bestand == Ist (Artikel-Detail/Journal zeigt Korrektur); Bestellung: markieren toggelt Status.

---

## 5. Definition of Done (M5)

**Lokal verifizierbar (`mise run dev` + Vitest):**
- Bestellvorschlag listet genau die Artikel unter Mindestbestand mit korrekter Vorschlagsmenge; „bestellt markieren" toggelt `bestelltAt`; Export liefert Copy + CSV; ein Zugang setzt die Markierung zurück (Bestandsregel M1, hier nur bestätigt).
- Inventur: gezählter Ist je Artikel → Abschluss (Pflicht-Kommentar) erzeugt `korrektur`-Buchungen, danach **`bestand == ist`** für jede korrigierte Position; Diff<0 FEFO über Chargen, Diff>0 auf jüngste/neue Charge; unveränderte Positionen erzeugen keine Buchung.
- Alles in einer Transaktion (alles-oder-nichts); `bestelltAt` von Inventur nicht berührt.
- Alle Unit-/Integration-/e2e-Tests grün; `typecheck`/`lint`/`build` grün.

---

## 6. Tests (im Plan namentlich zu verankern)

- **`fefoAbbuchung`**: `typ:"korrektur"` schreibt korrektur-Zeilen; Default `"entnahme"` unverändert; bestehende Entnahme-/Check-Tests grün.
- **`bestellvorschlag`**: nur Artikel unter Mindest; Vorschlagsmenge = `faktor·min − bestand`; `bestellt`-Flag aus `bestelltAt`. **`markiereBestellt`**: setzt/löscht `bestelltAt`.
- **`inventurKorrektur` (Kern):** `bestand === ist` nach Korrektur für: (a) `ist<bestand` über mehrere Chargen (FEFO, korrektur-Typ), (b) `ist>bestand` auf jüngste Charge, (c) `ist>bestand` bei Artikel ohne Charge → neue `2099-12`-Charge, (d) `ist==bestand` → keine Buchung; Pflicht-Kommentar erzwungen; `bestelltAt` unverändert; alle Buchungen `referenz="inventur:<id>"`.
- **e2e**: Inventur-Flow (Bestand==Ist) + Bestellung-Toggle.

---

## 7. Ausführung

Autonom (Auto-Modus): Ultracode-Workflow (~6 Tasks, test-first, Per-Task-Review + adversarialer Whole-Branch-Review + Fix-Wave), Branch `m5-bestellung-inventur`, Stall-Wächter re-armed. Bei Grün **lokal in `main` mergen**, **kein Push**. Danach unmittelbar M6.
