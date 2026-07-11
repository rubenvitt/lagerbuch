# M3 Chargen & Verfall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Verfall-Warnlisten + „aussondern"-Flow (Korrekturbuchung für abgelaufene Chargen) + getrennte Dashboard-KPIs, auf der bestehenden Ampel-Domänenlogik.

**Architecture:** Reine Read-Query (`verfallListe`) + eine neue Einzelcharge-`korrektur`-Action (`aussondern`, NICHT FEFO) + eine Verfall-Seite + KPI-Split. Keine neue Domänenregel, kein Schema-Change. Alles über die `SUM(menge)`-Bestandsinvariante.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Drizzle + better-sqlite3, Vitest, Playwright.

## Global Constraints

- **Design-Spec** [`docs/superpowers/specs/2026-07-11-lagerbuch-m3-chargen-verfall-design.md`](../specs/2026-07-11-lagerbuch-m3-chargen-verfall-design.md) ist maßgeblich.
- **`aussondern` ist Einzelcharge-`korrektur`, NICHT FEFO** — `entnehmenCore` NICHT wiederverwenden. Shape wie `bucheZugang`: Charge laden → `artikelId` aus der Charge (nicht vom Client) → `rest` in der Transaktion via `bestandProCharge` → eine Buchung `menge=-rest`, `typ:"korrektur"`, `quelleTyp:"oidc"`, `quelleId:userId`, `lagerortId:HANDLAGER_ID`, Pflicht-`kommentar`.
- **Nur abgelaufene Chargen aussonderbar** — `verfallStatus(charge.verfall, opts, new Date()).abgelaufen` **serverseitig** neu berechnen; rote-aber-nicht-abgelaufene Chargen ablehnen. **`bestelltAt` NICHT** zurücksetzen.
- **Pseudo-Charge `verfall="2099-12"`** ist immer grün/nicht-abgelaufen → nie in `verfallListe`, nie aussonderbar. Expliziter Test.
- **KPI-Split:** `chargenKritisch` = rest>0 & ampel∈{gelb,rot} & **nicht abgelaufen**; `chargenAbgelaufen` = rest>0 & abgelaufen. Disjunkt. Die bestehende `queries.test.ts`-Assertion wird **bewusst** angepasst.
- **Gemeinsame `opts`** aus der Config (`{kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig}`) in Query, Action, Übersicht.
- **Actions** nehmen `db: DB = getDb()` als letzten Param, gaten auf `requireAdmin`, validieren mit zod. Reuse: `Plakette`, `chargeText`/`chipTone`, `verfallStatus`, `bestandProCharge` — nichts davon ändern.
- **RTK:** bei mangled Output `rtk proxy pnpm …` nutzen.

---

## File Structure

**Neu:**
- `src/actions/aussondern.ts` — `aussondern`-Action
- `src/actions/aussondern.test.ts`
- `src/app/verwaltung/(admin)/verfall/page.tsx` — Warnliste (Server)
- `src/app/verwaltung/(admin)/verfall/VerfallItem.tsx` — presentational Row (kein "use client")
- `src/app/verwaltung/(admin)/verfall/AussondernRow.tsx` — Client-Row mit Aussondern-Aktion
- `e2e/verfall.spec.ts`

**Geändert:**
- `src/db/queries.ts` — `verfallListe` + `kennzahlen`-Split
- `src/db/queries.test.ts` — verfallListe-Tests + angepasste kennzahlen-Assertion
- `src/lib/domain/verfall.test.ts` — Zeitreise-Test
- `src/components/SideNav.tsx` — Nav-Eintrag „Verfall"
- `src/app/verwaltung/(admin)/page.tsx` — zweite Chargen-KPI + Verfall-Link
- `e2e/migrate-db.ts` — abgelaufene Test-Charge seeden

---

### Task 1: `verfallListe`-Query + Zeitreise-Domänentest

**Files:**
- Modify: `src/db/queries.ts`
- Modify: `src/db/queries.test.ts`
- Modify: `src/lib/domain/verfall.test.ts`

**Interfaces:**
- Produces: `type VerfallEintrag = { chargeId; chargenNr; verfall; rest; ampel: Ampel; abgelaufen: boolean; text; artikelId; artikelName; einheit; fach }`; `verfallListe(db: DB): VerfallEintrag[]` (nur rest>0 & nicht-grün, dringlichste zuerst).

- [ ] **Step 1: Zeitreise-Test** — in `src/lib/domain/verfall.test.ts` ergänzen (DoD):

```ts
it("Zeitreise: eine Charge wandert grün → gelb → rot → abgelaufen", () => {
  const verfall = "2026-09"; // Ablauf 2026-09-30 23:59:59 (lokal)
  const o = { kritisch: 31, faellig: 56 };
  expect(verfallStatus(verfall, o, new Date("2026-06-01T12:00:00")).ampel).toBe("gruen"); // ~121d
  expect(verfallStatus(verfall, o, new Date("2026-08-11T12:00:00")).ampel).toBe("gelb");  // ~50d
  expect(verfallStatus(verfall, o, new Date("2026-09-15T12:00:00")).ampel).toBe("rot");   // ~15d
  const s = verfallStatus(verfall, o, new Date("2026-10-05T12:00:00"));
  expect(s.abgelaufen).toBe(true);
  expect(s.ampel).toBe("rot");
});
```

- [ ] **Step 2: verfallListe-Tests** — in `src/db/queries.test.ts` ergänzen:

```ts
import { verfallListe } from "./queries";

describe("verfallListe", () => {
  function seedVerfall() {
    const db = createTestDb();
    const now = new Date();
    const lo = newId(); db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: now }).run();
    // abgelaufen, rest 5
    const cExp = newId(); db.insert(chargen).values({ id: cExp, artikelId: a, chargenNr: "EXP", verfall: "2020-01", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cExp, lagerortId: lo, menge: 5, quelleTyp: "oidc", quelleId: "u1" }).run();
    // grün (weit voraus), rest 4 → NICHT in der Liste
    const cOk = newId(); db.insert(chargen).values({ id: cOk, artikelId: a, chargenNr: "OK", verfall: "2099-01", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cOk, lagerortId: lo, menge: 4, quelleTyp: "oidc", quelleId: "u1" }).run();
    // Pseudo-Charge 2099-12, rest 2 → NIE in der Liste
    const cPseudo = newId(); db.insert(chargen).values({ id: cPseudo, artikelId: a, chargenNr: "PSEUDO", verfall: "2099-12", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cPseudo, lagerortId: lo, menge: 2, quelleTyp: "oidc", quelleId: "u1" }).run();
    // abgelaufen aber rest 0 (drainiert) → NICHT in der Liste
    const cDep = newId(); db.insert(chargen).values({ id: cDep, artikelId: a, chargenNr: "DEP", verfall: "2019-01", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cDep, lagerortId: lo, menge: 3, quelleTyp: "oidc", quelleId: "u1" }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "entnahme", artikelId: a, chargeId: cDep, lagerortId: lo, menge: -3, quelleTyp: "oidc", quelleId: "u1" }).run();
    return { db, cExp };
  }

  it("listet nur rest>0 & nicht-grüne Chargen; Pseudo-Charge 2099-12 nie", () => {
    const { db, cExp } = seedVerfall();
    const list = verfallListe(db);
    expect(list).toHaveLength(1);
    expect(list[0].chargeId).toBe(cExp);
    expect(list[0].abgelaufen).toBe(true);
    expect(list[0].rest).toBe(5);
    expect(list[0].artikelName).toBe("NaCl");
    expect(list.some((e) => e.verfall === "2099-12")).toBe(false);
  });

  it("sortiert dringlichste zuerst (abgelaufen vor rot vor gelb)", () => {
    const db = createTestDb();
    const now = new Date();
    const lo = newId(); db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
    const a = newId(); db.insert(artikel).values({ id: a, name: "X", einheit: "Stk", fach: "A1", mindestbestand: 0, createdAt: now }).run();
    const cExp = newId(); db.insert(chargen).values({ id: cExp, artikelId: a, chargenNr: "EXP", verfall: "2020-01", createdAt: now }).run();
    db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cExp, lagerortId: lo, menge: 1, quelleTyp: "oidc", quelleId: "u1" }).run();
    // eine grüne existiert nicht relevant; test nur, dass abgelaufen als erstes rankt wenn mehrere
    const list = verfallListe(db);
    expect(list[0].abgelaufen).toBe(true);
  });
});
```

- [ ] **Step 3: Tests rot** — `rtk proxy pnpm vitest run src/lib/domain/verfall.test.ts src/db/queries.test.ts`
Expected: Zeitreise grün (Domäne existiert); verfallListe-Tests FAIL (Funktion fehlt).

- [ ] **Step 4: `verfallListe` implementieren** — in `src/db/queries.ts`. Imports zusammenführen (vorhanden aus M2: `verfallStatus`, `config`, `chargeText`; ggf. `Ampel`-Typ ergänzen):

```ts
import type { Ampel } from "@/lib/domain/verfall";
// (verfallStatus, chargeText, config, bestandProCharge, artikel/buchungen/chargen sind bereits importiert)

export type VerfallEintrag = {
  chargeId: string; chargenNr: string; verfall: string; rest: number;
  ampel: Ampel; abgelaufen: boolean; text: string;
  artikelId: string; artikelName: string; einheit: string; fach: string;
};

export function verfallListe(db: DB): VerfallEintrag[] {
  const now = new Date();
  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const chs = db.select().from(chargen).all();
  const rest = bestandProCharge(
    db.select().from(buchungen).all().map((b) => ({ chargeId: b.chargeId, menge: b.menge })),
  );
  const eintraege: VerfallEintrag[] = [];
  for (const c of chs) {
    const r = rest.get(c.id) ?? 0;
    if (r <= 0) continue;
    const s = verfallStatus(c.verfall, opts, now);
    if (s.ampel === "gruen") continue;
    const a = arts.get(c.artikelId);
    if (!a) continue;
    eintraege.push({
      chargeId: c.id, chargenNr: c.chargenNr, verfall: c.verfall, rest: r,
      ampel: s.ampel, abgelaufen: s.abgelaufen, text: chargeText(s, c.verfall),
      artikelId: a.id, artikelName: a.name, einheit: a.einheit, fach: a.fach,
    });
  }
  const rank = (e: VerfallEintrag) => (e.abgelaufen ? 0 : e.ampel === "rot" ? 1 : 2);
  eintraege.sort((x, y) => rank(x) - rank(y) || x.verfall.localeCompare(y.verfall));
  return eintraege;
}
```

- [ ] **Step 5: Tests grün** — `rtk proxy pnpm vitest run src/lib/domain/verfall.test.ts src/db/queries.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/db/queries.ts src/db/queries.test.ts src/lib/domain/verfall.test.ts
git commit -m "feat: verfallListe warn-query + verfall zeitreise test"
```

---

### Task 2: `kennzahlen`-KPI-Split (abgelaufen vs. kritisch)

**Files:**
- Modify: `src/db/queries.ts`
- Modify: `src/db/queries.test.ts`

**Interfaces:**
- Produces: `kennzahlen` liefert zusätzlich `chargenAbgelaufen: number`; `chargenKritisch` zählt jetzt gelb/rot **ohne** abgelaufene.

- [ ] **Step 1: Bestehende Assertion anpassen + neue** — in `src/db/queries.test.ts` den Test `"chargenKritisch counts an at-risk charge…"` (seedet `verfall:"2020-01"`, abgelaufen) ersetzen durch:

```ts
it("splits chargenAbgelaufen (expired, rest>0) from chargenKritisch (at-risk, not expired); depleted excluded", () => {
  const db = createTestDb();
  const now = new Date();
  const lo = newId(); db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
  const a = newId(); db.insert(artikel).values({ id: a, name: "Mullbinde", einheit: "Stk.", fach: "A2", mindestbestand: 0, createdAt: now }).run();
  // abgelaufen mit rest>0 → chargenAbgelaufen, NICHT chargenKritisch
  const cLive = newId(); db.insert(chargen).values({ id: cLive, artikelId: a, chargenNr: "LIVE", verfall: "2020-01", createdAt: now }).run();
  db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cLive, lagerortId: lo, menge: 5, quelleTyp: "oidc", quelleId: "u1" }).run();
  // abgelaufen aber rest 0 → weder noch
  const cDep = newId(); db.insert(chargen).values({ id: cDep, artikelId: a, chargenNr: "DEP", verfall: "2019-01", createdAt: now }).run();
  db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cDep, lagerortId: lo, menge: 3, quelleTyp: "oidc", quelleId: "u1" }).run();
  db.insert(buchungen).values({ id: newId(), ts: now, typ: "entnahme", artikelId: a, chargeId: cDep, lagerortId: lo, menge: -3, quelleTyp: "oidc", quelleId: "u1" }).run();

  const k = kennzahlen(db);
  expect(k.chargenAbgelaufen).toBe(1); // cLive
  expect(k.chargenKritisch).toBe(0);   // cLive ist abgelaufen (zählt dort nicht), cDep rest 0
});
```

- [ ] **Step 2: Test rot** — `rtk proxy pnpm vitest run src/db/queries.test.ts` → FAIL (`chargenAbgelaufen` undefined).

- [ ] **Step 3: `kennzahlen` anpassen** — in `src/db/queries.ts` den Chargen-Zählblock ersetzen:

```ts
  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };
  let chargenKritisch = 0;
  let chargenAbgelaufen = 0;
  for (const c of db.select().from(chargen).all()) {
    if ((restProCharge.get(c.id) ?? 0) <= 0) continue; // depleted → kein Risiko
    const s = verfallStatus(c.verfall, opts, now);
    if (s.abgelaufen) chargenAbgelaufen++;
    else if (s.ampel !== "gruen") chargenKritisch++;
  }
```
und den Return um `chargenAbgelaufen` erweitern:
```ts
  return { unterMindest, chargenKritisch, chargenAbgelaufen, offeneBestellungen, buchungenGesamt };
```

- [ ] **Step 4: Test grün** — `rtk proxy pnpm vitest run src/db/queries.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/db/queries.ts src/db/queries.test.ts
git commit -m "feat: split kennzahlen into chargenKritisch (at-risk) vs chargenAbgelaufen"
```

---

### Task 3: `aussondern`-Server-Action

**Files:**
- Create: `src/actions/aussondern.ts`
- Test: `src/actions/aussondern.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `bestandProCharge`, `verfallStatus`, `config`, `HANDLAGER_ID`.
- Produces: `aussondern(input: { chargeId: string; kommentar: string }, db?: DB): Promise<{ ausgesondert: true }>`.

- [ ] **Step 1: Failing test** — `src/actions/aussondern.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/config", () => ({ config: { warnTageKritisch: 31, warnTageFaellig: 56 } }));
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bestand } from "@/lib/domain/bestand";
import { ensureHandlager, HANDLAGER_ID } from "@/db/seed-handlager";
import { aussondern } from "./aussondern";

function seed({ verfall = "2020-01", menge = 5, bestelltAt = null as Date | null } = {}) {
  const db = createTestDb();
  ensureHandlager(db);
  const aId = newId();
  db.insert(artikel).values({ id: aId, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, bestelltAt, createdAt: new Date() }).run();
  const cId = newId();
  db.insert(chargen).values({ id: cId, artikelId: aId, chargenNr: "C1", verfall, createdAt: new Date() }).run();
  if (menge > 0) db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: aId, chargeId: cId, lagerortId: HANDLAGER_ID, menge, quelleTyp: "oidc", quelleId: "u1" }).run();
  return { db, aId, cId };
}

describe("aussondern", () => {
  it("bucht -rest als korrektur; Artikel-Bestand sinkt auf 0", async () => {
    const { db, aId, cId } = seed({ verfall: "2020-01", menge: 5 });
    await aussondern({ chargeId: cId, kommentar: "abgelaufen 01/2020" }, db);
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, aId)).all();
    const korr = bu.find((b) => b.typ === "korrektur")!;
    expect(korr.menge).toBe(-5);
    expect(korr.kommentar).toBe("abgelaufen 01/2020");
    expect(korr.quelleTyp).toBe("oidc");
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(0);
  });
  it("erzwingt Pflicht-Kommentar", async () => {
    const { db, cId } = seed();
    await expect(aussondern({ chargeId: cId, kommentar: "  " }, db)).rejects.toThrow();
  });
  it("lehnt Charge ohne Restbestand ab", async () => {
    const { db, cId } = seed({ verfall: "2020-01", menge: 0 });
    await expect(aussondern({ chargeId: cId, kommentar: "x" }, db)).rejects.toThrow(/Restbestand/);
  });
  it("lehnt nicht-abgelaufene Charge ab", async () => {
    const { db, cId } = seed({ verfall: "2099-01", menge: 5 });
    await expect(aussondern({ chargeId: cId, kommentar: "x" }, db)).rejects.toThrow(/abgelaufen/);
  });
  it("lehnt die Pseudo-Charge 2099-12 ab (immer grün)", async () => {
    const { db, cId } = seed({ verfall: "2099-12", menge: 5 });
    await expect(aussondern({ chargeId: cId, kommentar: "x" }, db)).rejects.toThrow(/abgelaufen/);
  });
  it("lehnt unbekannte Charge ab", async () => {
    const { db } = seed();
    await expect(aussondern({ chargeId: "nope", kommentar: "x" }, db)).rejects.toThrow();
  });
  it("lässt bestelltAt unverändert", async () => {
    const bestellt = new Date("2026-01-01");
    const { db, aId, cId } = seed({ verfall: "2020-01", menge: 5, bestelltAt: bestellt });
    await aussondern({ chargeId: cId, kommentar: "x" }, db);
    expect(db.select().from(artikel).where(eq(artikel.id, aId)).get()!.bestelltAt?.getTime()).toBe(bestellt.getTime());
  });
});
```

- [ ] **Step 2: Test rot** — `rtk proxy pnpm vitest run src/actions/aussondern.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: `aussondern.ts`**

```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { requireAdmin } from "@/actions/session";
import { bestandProCharge } from "@/lib/domain/bestand";
import { verfallStatus } from "@/lib/domain/verfall";
import { config } from "@/lib/config";

const AussondernSchema = z.object({
  chargeId: z.string().min(1),
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
});

// Sondert eine ABGELAUFENE Charge aus: eine korrektur-Buchung menge=-rest für genau
// diese Charge (NICHT FEFO). artikelId wird aus der geladenen Charge abgeleitet.
export async function aussondern(input: z.input<typeof AussondernSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = AussondernSchema.parse(input);
  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };
  db.transaction((tx) => {
    const charge = tx.select().from(chargen).where(eq(chargen.id, v.chargeId)).get();
    if (!charge) throw new Error("Charge nicht gefunden");
    if (!verfallStatus(charge.verfall, opts, new Date()).abgelaufen) {
      throw new Error("Nur abgelaufene Chargen können ausgesondert werden");
    }
    const bu = tx.select().from(buchungen).where(eq(buchungen.chargeId, v.chargeId)).all();
    const rest = bestandProCharge(bu.map((b) => ({ chargeId: b.chargeId, menge: b.menge }))).get(v.chargeId) ?? 0;
    if (rest <= 0) throw new Error("Charge hat keinen Restbestand");
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ: "korrektur",
      artikelId: charge.artikelId, chargeId: charge.id, lagerortId: HANDLAGER_ID,
      menge: -rest, quelleTyp: "oidc", quelleId: userId, kommentar: v.kommentar,
    }).run();
  });
  revalidatePath("/verwaltung/verfall");
  revalidatePath("/verwaltung/artikel");
  revalidatePath("/verwaltung");
  return { ausgesondert: true as const };
}
```

- [ ] **Step 4: Test grün** — `rtk proxy pnpm vitest run src/actions/aussondern.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/actions/aussondern.ts src/actions/aussondern.test.ts
git commit -m "feat: aussondern action (single-charge korrektur for expired chargen)"
```

---

### Task 4: Verfall-Warnliste-Seite + SideNav + Aussondern-UI

**Files:**
- Create: `src/app/verwaltung/(admin)/verfall/VerfallItem.tsx`
- Create: `src/app/verwaltung/(admin)/verfall/AussondernRow.tsx`
- Create: `src/app/verwaltung/(admin)/verfall/page.tsx`
- Modify: `src/components/SideNav.tsx`

**Interfaces:**
- Consumes: `verfallListe` (T1), `aussondern` (T3), `Plakette`, `chipTone`.

- [ ] **Step 1: SideNav-Eintrag** — in `src/components/SideNav.tsx` Import + NAV ergänzen:
```ts
import { CalendarClock, History, KeyRound, LayoutDashboard, Package, Upload } from "lucide-react";
```
NAV nach „Artikel":
```ts
  { href: "/verwaltung/verfall", label: "Verfall", icon: CalendarClock },
```

- [ ] **Step 2: `VerfallItem.tsx`** (presentational, KEIN "use client" → server- und client-nutzbar):

```tsx
import type { ReactNode } from "react";
import { Plakette } from "@/components/Plakette";
import { chipTone } from "@/lib/format";
import type { Ampel } from "@/lib/domain/verfall";

export type VerfallEintragView = {
  chargeId: string; chargenNr: string; verfall: string; rest: number;
  ampel: Ampel; abgelaufen: boolean; text: string;
  artikelId: string; artikelName: string; einheit: string; fach: string;
};

export function VerfallItem({ eintrag, action }: { eintrag: VerfallEintragView; action?: ReactNode }) {
  return (
    <div className="row">
      <Plakette verfall={eintrag.verfall} ampel={eintrag.ampel} />
      <div className="rowmain">
        <div className="rowname">{eintrag.artikelName}</div>
        <div className="rowmeta">
          <span className="fach">{eintrag.fach}</span>
          <span style={{ font: "600 12px var(--mono)" }}>Charge {eintrag.chargenNr}</span>
          <span className={`chip chip-${chipTone(eintrag.ampel)}`}>{eintrag.text}</span>
        </div>
      </div>
      <div className="bignum" style={{ fontSize: 20 }}>
        {eintrag.rest}
        <small>{eintrag.einheit}</small>
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 3: `AussondernRow.tsx`** (Client, abgelaufene Zeile mit Aktion):

```tsx
"use client";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { aussondern } from "@/actions/aussondern";
import { VerfallItem, type VerfallEintragView } from "./VerfallItem";

export function AussondernRow({ eintrag }: { eintrag: VerfallEintragView }) {
  const [open, setOpen] = useState(false);
  const [kommentar, setKommentar] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!kommentar.trim()) { setErr("Kommentar erforderlich"); return; }
    start(async () => {
      try {
        await aussondern({ chargeId: eintrag.chargeId, kommentar: kommentar.trim() });
        // revalidatePath aktualisiert die Liste → die Zeile verschwindet beim Re-Render.
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Fehler beim Aussondern");
      }
    });
  }

  return (
    <div>
      <VerfallItem
        eintrag={eintrag}
        action={!open ? (
          <button className="btn btn-rot" onClick={() => setOpen(true)}>
            <Trash2 size={15} /> Aussondern
          </button>
        ) : undefined}
      />
      {open && (
        <div className="cardpad" style={{ display: "grid", gap: 8 }}>
          <input className="input" placeholder="Grund (Pflicht), z. B. abgelaufen 01/2020" value={kommentar}
            autoFocus onChange={(e) => { setKommentar(e.target.value); setErr(null); }} />
          {err && <div className="gateerr">{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-rot" disabled={pending || !kommentar.trim()} onClick={submit}>
              {eintrag.rest}× aussondern
            </button>
            <button className="btn btn-ghost" onClick={() => { setOpen(false); setErr(null); }}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `page.tsx`** (Server, gruppiert):

```tsx
import { getDb } from "@/db";
import { verfallListe } from "@/db/queries";
import { VerfallItem } from "./VerfallItem";
import { AussondernRow } from "./AussondernRow";

export const dynamic = "force-dynamic";

export default function VerfallPage() {
  const eintraege = verfallListe(getDb());
  const abgelaufen = eintraege.filter((e) => e.abgelaufen);
  const kritisch = eintraege.filter((e) => !e.abgelaufen && e.ampel === "rot");
  const faellig = eintraege.filter((e) => !e.abgelaufen && e.ampel === "gelb");

  return (
    <>
      <div className="mainhead"><h1>Verfall</h1></div>
      {eintraege.length === 0 && <div className="card cardpad">Keine Chargen im Warnbereich – alles frisch.</div>}

      {abgelaufen.length > 0 && (
        <section>
          <div className="cardtitle" style={{ marginTop: 8 }}>Abgelaufen — aussondern nötig ({abgelaufen.length})</div>
          <div className="card">
            {abgelaufen.map((e) => <AussondernRow key={e.chargeId} eintrag={e} />)}
          </div>
        </section>
      )}
      {kritisch.length > 0 && (
        <section>
          <div className="cardtitle" style={{ marginTop: 8 }}>Kritisch — läuft ab ({kritisch.length})</div>
          <div className="card">{kritisch.map((e) => <VerfallItem key={e.chargeId} eintrag={e} />)}</div>
        </section>
      )}
      {faellig.length > 0 && (
        <section>
          <div className="cardtitle" style={{ marginTop: 8 }}>Bald fällig ({faellig.length})</div>
          <div className="card">{faellig.map((e) => <VerfallItem key={e.chargeId} eintrag={e} />)}</div>
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 5: Typecheck + Lint + Build** — `rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm build`
Expected: grün (VerfallItem hat kein "use client" und ist als reine Präsentation in Server- wie Client-Komponente nutzbar; `aussondern` als `"use server"`-Action sauber vom Client importiert).

- [ ] **Step 6: Commit**
```bash
git add src/app/verwaltung/\(admin\)/verfall src/components/SideNav.tsx
git commit -m "feat: verfall warn-list page with grouped chargen + aussondern UI"
```

---

### Task 5: Übersicht-KPI-Erweiterung (abgelaufen-Kachel + Verfall-Link)

**Files:**
- Modify: `src/app/verwaltung/(admin)/page.tsx`

**Interfaces:**
- Consumes: `kennzahlen().chargenAbgelaufen` (T2).

- [ ] **Step 1: KPI-Grid anpassen** — in `src/app/verwaltung/(admin)/page.tsx` den bestehenden Chargen-KPI-Block ersetzen. Alt:
```tsx
        <div className={`kpi ${k.chargenKritisch ? "gelb" : "ok"}`}>
          <b>{k.chargenKritisch}</b>
          <div>Chargen bald fällig / abgelaufen</div>
        </div>
```
Neu (zwei Kacheln, beide zur Verfall-Seite verlinkt — `Link` ist bereits importiert):
```tsx
        <Link className={`kpi ${k.chargenKritisch ? "gelb" : "ok"}`} href="/verwaltung/verfall">
          <b>{k.chargenKritisch}</b>
          <div>Chargen bald fällig / kritisch</div>
        </Link>
        <Link className={`kpi ${k.chargenAbgelaufen ? "rot" : "ok"}`} href="/verwaltung/verfall">
          <b>{k.chargenAbgelaufen}</b>
          <div>abgelaufen — aussondern nötig</div>
        </Link>
```

- [ ] **Step 2: Typecheck + Lint + Build** — `rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm build` → grün.

- [ ] **Step 3: Commit**
```bash
git add src/app/verwaltung/\(admin\)/page.tsx
git commit -m "feat: split overview KPI into faellig + abgelaufen tiles linking to verfall"
```

---

### Task 6: e2e — abgelaufene Charge → aussondern → Journal-Korrektur

**Files:**
- Modify: `e2e/migrate-db.ts`
- Create: `e2e/verfall.spec.ts`

**Interfaces:**
- Consumes: laufender Dev-Server mit Wegwerf-DB (bestehende `playwright.config.ts` `webServer`-Chain), Demo-Login.

- [ ] **Step 1: Seed einer abgelaufenen Charge** — in `e2e/migrate-db.ts` idempotent einen Artikel mit einer **abgelaufenen** Charge (verfall `2020-01`) und Restbestand > 0 ergänzen (analog zum bestehenden Seed-Stil). Merkbarer Name, z. B. `"E2E Verfall NaCl"`, Charge `"E2E-EXP"`, Zugang `menge: 3`, `lagerortId: HANDLAGER_ID`. Den Namen im Test verwenden.

- [ ] **Step 2: Spec schreiben** — `e2e/verfall.spec.ts` (Demo-Login-Schritte wie in `e2e/verwaltung-flow.spec.ts` übernehmen):

```ts
import { test, expect } from "@playwright/test";

// Login-Helfer analog e2e/verwaltung-flow.spec.ts (Demo-Login).
async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo-Login (nur Entwicklung)" }).click();
  await expect(page).toHaveURL(/\/verwaltung/);
}

test("abgelaufene Charge aussondern → Journal-Korrektur, Warnliste leert sich", async ({ page }) => {
  await login(page);
  await page.goto("/verwaltung/verfall");

  // Die abgelaufene Test-Charge ist sichtbar unter „Abgelaufen".
  const zeile = page.locator(".row", { hasText: "E2E Verfall NaCl" });
  await expect(zeile.first()).toBeVisible();

  // Aussondern-Flow
  await page.getByRole("button", { name: /Aussondern/ }).first().click();
  await page.getByPlaceholder(/Grund/).fill("abgelaufen 01/2020");
  await page.getByRole("button", { name: /aussondern/ }).click();

  // Charge verschwindet aus der Warnliste
  await expect(page.locator(".row", { hasText: "E2E Verfall NaCl" })).toHaveCount(0);

  // Journal zeigt die Korrekturbuchung
  await page.goto("/verwaltung/journal");
  await expect(page.getByText("E2E Verfall NaCl").first()).toBeVisible();
});
```
**Hinweis:** Falls der `getByRole("button", { name: /aussondern/ })`-Selektor mehrdeutig ist (der „Aussondern"-Öffner und der „N× aussondern"-Bestätiger), im Test präzisieren (z. B. exakter Name `"3× aussondern"` bzw. `.getByRole("button", { name: /× aussondern/ })`). Empirisch grün bekommen.

- [ ] **Step 3: e2e ausführen** — `rtk proxy pnpm exec playwright test e2e/verfall.spec.ts`
Expected: grün.

- [ ] **Step 4: Commit**
```bash
git add e2e/verfall.spec.ts e2e/migrate-db.ts
git commit -m "test: e2e verfall warn-list → aussondern → journal korrektur"
```

---

## Abschluss

Nach Task 6: volle Suite grün stellen und Schluss-Review.
```bash
rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm test && rtk proxy pnpm build
```
Whole-Branch-Review (adversarial), Fix-Wave, dann lokal in `main` mergen (wie M0–M2). **Kein Push.**
