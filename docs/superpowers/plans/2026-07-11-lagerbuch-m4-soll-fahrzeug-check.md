# M4 Soll & Fahrzeug-Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Soll-Editor je Fahrzeug (Admin) + mobiler Helfer-Fahrzeug-Check, dessen Abschluss `checks`-Historie schreibt und je Fehlmenge eine FEFO-Handlager-Entnahme mit `referenz="check:<id>"` bucht — alles in einer Transaktion.

**Architecture:** Transaktions-freier `fefoAbbuchung(tx,…)`-Kern (geteilt von Entnahme-Wrappern + `checkAbschluss`). Fahrzeuge = `lagerorte(typ="fahrzeug")`. Soll = `sollPositionen`. Check = pure `fehlmengen` + eine `checkAbschluss`-Transaktion. UI: Admin-Fahrzeug/Soll-Editor + Helfer-Check-Tab.

**Tech Stack:** Next.js 15, React 19, TS strict, Drizzle + better-sqlite3, Vitest, Playwright.

## Global Constraints

- **Design-Spec** [`docs/superpowers/specs/2026-07-11-lagerbuch-m4-soll-fahrzeug-check-design.md`](../specs/2026-07-11-lagerbuch-m4-soll-fahrzeug-check-design.md) ist maßgeblich; UI-Referenz `mockup.jsx` `HelferView` CheckScreen (Z. 447–512) + `checkAbbuchen` (Z. 369–376).
- **DIE TRANSAKTION:** `fefoAbbuchung(tx, {artikelId, menge, quelle, kommentar, referenz})` ist **transaktions-FREI** (läuft in einer bestehenden `tx`), liegt in **`src/db/abbuchung.ts`** (NICHT in `buchung.ts` — das ist `"use server"` + client-importiert → nur async-Exports erlaubt). `checkAbschluss` öffnet EINE Transaktion → `insert(checks)` → je Fehlmenge `fefoAbbuchung(tx, {…, referenz:"check:"+id})`. **NIEMALS** Entnahme-Actions oder einen transaktions-öffnenden Kern je Fehlmenge aufrufen.
- **Scope:** Check ist Helfer/mobil (`requireHelfer`, `quelleTyp="token"`); Soll-Editor + Fahrzeug-CRUD + Historie sind Admin (`requireAdmin`). KEIN Admin-Desktop-Check, KEIN Token-Scope-Picker (Helfer wählt Fahrzeug aus Liste), KEIN Fahrzeug-Bestandsjournal (Check bucht Handlager-Entnahmen), Single-Shot (`startedAt=completedAt=now`).
- **`checks.ergebnis`** = JSON-String `[{sollPositionId, artikelId, soll, ist, fehlt, gebucht}]`. `soll`/`artikelId` serverseitig aus der `sollPositionen`-Zeile (per `sollPositionId`), nicht vom Client.
- **Actions** nehmen `db: DB = getDb()`, gaten zuerst, validieren mit zod. Reuse: `fefoVerteilung`, `bestandProCharge`, `Stepper`, `Plakette`, checkcircle-CSS (alle vorhanden) — nicht ändern.
- **RTK:** `rtk proxy pnpm …`.

---

## File Structure

**Neu:** `src/db/abbuchung.ts`, `src/lib/domain/check.ts` (+`.test.ts`), `src/actions/fahrzeuge.ts` (+`.test.ts`), `src/actions/check.ts` (+`.test.ts`), `src/app/verwaltung/(admin)/fahrzeuge/{page,NeuFahrzeug,SollEditor}.tsx`, `src/app/verwaltung/(admin)/checks/page.tsx`, `src/app/helfer/check/{page,CheckFlow}.tsx`.
**Geändert:** `src/actions/buchung.ts` (auf `fefoAbbuchung` umgestellt), `src/db/queries.ts` (`fahrzeugListe`, `sollFuerFahrzeug`, `checkHistorie`), `src/components/HelferFrame.tsx` (2-Tab), `src/components/SideNav.tsx`, `e2e/migrate-db.ts`, neuer `e2e/check.spec.ts`.

---

### Task 1: FEFO-Refactor — `fefoAbbuchung(tx,…)` + buchung.ts

**Files:**
- Create: `src/db/abbuchung.ts`
- Modify: `src/actions/buchung.ts`
- Modify: `src/actions/buchung.test.ts`

**Interfaces:**
- Produces: `type Tx`; `fefoAbbuchung(tx: Tx, args: { artikelId: string; menge: number; quelle: { quelleTyp: "oidc" | "token"; quelleId: string }; kommentar: string | null; referenz: string | null }): number` (gebuchte Menge). Ersetzt `entnehmenCore`.

- [ ] **Step 1: `src/db/abbuchung.ts`**

```ts
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { fefoVerteilung } from "@/lib/domain/fefo";
import { bestandProCharge } from "@/lib/domain/bestand";

// tx-Typ der Drizzle-Transaktion (Callback-Parameter von db.transaction).
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type Quelle = { quelleTyp: "oidc" | "token"; quelleId: string };

// Transaktions-FREIER FEFO-Abbuchungskern: laeuft INNERHALB einer bestehenden tx.
// Verteilt `menge` FEFO ueber die Chargen des Artikels (Rest>0, aufsteigender Verfall),
// kappt am Bestand, je Charge eine entnahme-Buchung (optional mit referenz). Gibt die
// tatsaechlich gebuchte Menge zurueck. Geteilt von Entnahme-Wrappern UND checkAbschluss.
export function fefoAbbuchung(
  tx: Tx,
  args: { artikelId: string; menge: number; quelle: Quelle; kommentar: string | null; referenz: string | null },
): number {
  const { artikelId, menge, quelle, kommentar, referenz } = args;
  const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  const bu = tx.select().from(buchungen).where(eq(buchungen.artikelId, artikelId)).all();
  const rest = bestandProCharge(bu.map((b) => ({ chargeId: b.chargeId, menge: b.menge })));
  const chargenRest = chs.map((c) => ({ chargeId: c.id, verfall: c.verfall, rest: rest.get(c.id) ?? 0 }));
  let gebucht = 0;
  for (const teil of fefoVerteilung(chargenRest, menge)) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ: "entnahme", artikelId, chargeId: teil.chargeId,
      lagerortId: HANDLAGER_ID, menge: -teil.menge, quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
      referenz, kommentar,
    }).run();
    gebucht += teil.menge;
  }
  return gebucht;
}
```

- [ ] **Step 2: `buchung.ts` umstellen** — `entnehmenCore` + `Quelle`-Typ ENTFERNEN, `fefoAbbuchung` importieren, Wrapper auf eine tx umstellen:

Import ergänzen: `import { fefoAbbuchung } from "@/db/abbuchung";` (und die nun ungenutzten `fefoVerteilung`/`bestandProCharge`-Imports entfernen, falls sonst nirgends genutzt).
`bucheEntnahme`:
```ts
export async function bucheEntnahme(input: z.input<typeof EntnahmeSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = EntnahmeSchema.parse(input);
  let gebucht = 0;
  db.transaction((tx) => {
    gebucht = fefoAbbuchung(tx, { artikelId: v.artikelId, menge: v.menge, quelle: { quelleTyp: "oidc", quelleId: userId }, kommentar: v.kommentar ?? null, referenz: null });
  });
  revalidatePath("/verwaltung/artikel");
  revalidatePath("/verwaltung");
  return { gebucht };
}
```
`bucheEntnahmeHelfer`:
```ts
export async function bucheEntnahmeHelfer(input: z.input<typeof HelferEntnahmeSchema>, db: DB = getDb()) {
  const { code } = await requireHelfer(db);
  const v = HelferEntnahmeSchema.parse(input);
  let gebucht = 0;
  db.transaction((tx) => {
    gebucht = fefoAbbuchung(tx, { artikelId: v.artikelId, menge: v.menge, quelle: { quelleTyp: "token", quelleId: code }, kommentar: null, referenz: null });
  });
  revalidatePath(`/a/${v.artikelId}`);
  revalidatePath("/helfer");
  revalidatePath("/verwaltung");
  return { gebucht };
}
```

- [ ] **Step 3: Test ergänzen** — in `src/actions/buchung.test.ts` (die bestehenden Entnahme-Tests MÜSSEN grün bleiben) ergänzen:
```ts
it("normale Entnahme setzt referenz=null", async () => {
  const { db, id } = seedArtikel();
  await bucheZugang({ artikelId: id, menge: 4, neueCharge: { chargenNr: "H", verfall: "2028-01" } }, db);
  await bucheEntnahme({ artikelId: id, menge: 2 }, db);
  const entn = db.select().from(buchungen).where(eq(buchungen.typ, "entnahme")).all();
  expect(entn.length).toBeGreaterThan(0);
  expect(entn.every((b) => b.referenz === null)).toBe(true);
});
```

- [ ] **Step 4: Tests grün** — `rtk proxy pnpm vitest run src/actions/buchung.test.ts` → PASS (alle bestehenden + neu). Zusätzlich `rtk proxy pnpm typecheck`.

- [ ] **Step 5: Commit**
```bash
git add src/db/abbuchung.ts src/actions/buchung.ts src/actions/buchung.test.ts
git commit -m "refactor: extract tx-free fefoAbbuchung (with referenz) shared by entnahme + check"
```

---

### Task 2: Fahrzeug + Soll Server-Layer (Actions + Queries)

**Files:**
- Create: `src/actions/fahrzeuge.ts`
- Create: `src/actions/fahrzeuge.test.ts`
- Modify: `src/db/queries.ts`

**Interfaces:**
- Produces (Actions, `requireAdmin`):
  - `createFahrzeug(input: { name: string; kennung?: string }, db?): Promise<{ id: string }>`
  - `setFahrzeugAktiv(input: { id: string; aktiv: boolean }, db?): Promise<void>`
  - `sollPositionSetzen(input: { id?: string; fahrzeugId: string; fachLabel: string; artikelId: string; soll: number; sort?: number }, db?): Promise<{ id: string }>` (upsert)
  - `sollPositionEntfernen(input: { id: string }, db?): Promise<void>`
- Produces (Queries): `fahrzeugListe(db): { id; name; kennung; aktiv }[]`; `type SollZeile = { id; fachLabel; sort; artikelId; artikelName; einheit; handlagerFach; soll; bestand }`; `sollFuerFahrzeug(db, fahrzeugId): SollZeile[]` (sort: fachLabel, dann sort).

- [ ] **Step 1: Failing test** — `src/actions/fahrzeuge.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { lagerorte, artikel, sollPositionen, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createFahrzeug, sollPositionSetzen, sollPositionEntfernen } from "./fahrzeuge";
import { fahrzeugListe, sollFuerFahrzeug } from "@/db/queries";

function seedArtikel(db) {
  const a = newId();
  db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: new Date() }).run();
  return a;
}

describe("Fahrzeug + Soll", () => {
  it("createFahrzeug legt lagerort typ=fahrzeug an", async () => {
    const db = createTestDb();
    const { id } = await createFahrzeug({ name: "RTW 1", kennung: "XX-RK 100" }, db);
    const lo = db.select().from(lagerorte).where(eq(lagerorte.id, id)).get()!;
    expect(lo.typ).toBe("fahrzeug");
    expect(lo.name).toBe("RTW 1");
    expect(fahrzeugListe(db)).toHaveLength(1);
  });
  it("sollPositionSetzen upsert + sollFuerFahrzeug liefert Artikel-Handlagerfach", async () => {
    const db = createTestDb();
    const a = seedArtikel(db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);
    const { id: pos } = await sollPositionSetzen({ fahrzeugId: fz, fachLabel: "Schrank 1", artikelId: a, soll: 4 }, db);
    let list = sollFuerFahrzeug(db, fz);
    expect(list).toHaveLength(1);
    expect(list[0].soll).toBe(4);
    expect(list[0].artikelName).toBe("NaCl");
    expect(list[0].handlagerFach).toBe("B2");
    // update (gleiche id)
    await sollPositionSetzen({ id: pos, fahrzeugId: fz, fachLabel: "Schrank 1", artikelId: a, soll: 6 }, db);
    list = sollFuerFahrzeug(db, fz);
    expect(list).toHaveLength(1);
    expect(list[0].soll).toBe(6);
  });
  it("sollPositionEntfernen löscht die Position", async () => {
    const db = createTestDb();
    const a = seedArtikel(db);
    const { id: fz } = await createFahrzeug({ name: "RTW 1" }, db);
    const { id: pos } = await sollPositionSetzen({ fahrzeugId: fz, fachLabel: "S1", artikelId: a, soll: 2 }, db);
    await sollPositionEntfernen({ id: pos }, db);
    expect(sollFuerFahrzeug(db, fz)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Test rot** — `rtk proxy pnpm vitest run src/actions/fahrzeuge.test.ts` → FAIL.

- [ ] **Step 3: Queries** — in `src/db/queries.ts` ergänzen (Imports `lagerorte`, `sollPositionen` ergänzen):
```ts
export function fahrzeugListe(db: DB) {
  return db.select().from(lagerorte).where(eq(lagerorte.typ, "fahrzeug")).all()
    .map((f) => ({ id: f.id, name: f.name, kennung: f.kennung, aktiv: f.aktiv }));
}

export type SollZeile = { id: string; fachLabel: string; sort: number; artikelId: string; artikelName: string; einheit: string; handlagerFach: string; soll: number; bestand: number };

export function sollFuerFahrzeug(db: DB, fahrzeugId: string): SollZeile[] {
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const allBu = db.select().from(buchungen).all();
  const rows = db.select().from(sollPositionen).where(eq(sollPositionen.fahrzeugId, fahrzeugId)).all();
  return rows
    .map((p) => {
      const a = arts.get(p.artikelId);
      const b = bestand(allBu.filter((x) => x.artikelId === p.artikelId).map((x) => ({ menge: x.menge })));
      return {
        id: p.id, fachLabel: p.fachLabel, sort: p.sort, artikelId: p.artikelId,
        artikelName: a?.name ?? "–", einheit: a?.einheit ?? "", handlagerFach: a?.fach ?? "", soll: p.soll, bestand: b,
      };
    })
    .sort((x, y) => x.fachLabel.localeCompare(y.fachLabel) || x.sort - y.sort);
}
```
(`bestand` ist in queries.ts bereits importiert.)

- [ ] **Step 4: `src/actions/fahrzeuge.ts`**
```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { lagerorte, sollPositionen, newId } from "@/db/schema";
import { requireAdmin } from "@/actions/session";

const FahrzeugSchema = z.object({ name: z.string().trim().min(1), kennung: z.string().trim().optional() });

export async function createFahrzeug(input: z.input<typeof FahrzeugSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = FahrzeugSchema.parse(input);
  const id = newId();
  db.insert(lagerorte).values({ id, name: v.name, typ: "fahrzeug", kennung: v.kennung ?? null, aktiv: true }).run();
  revalidatePath("/verwaltung/fahrzeuge");
  return { id };
}

const AktivSchema = z.object({ id: z.string().min(1), aktiv: z.boolean() });
export async function setFahrzeugAktiv(input: z.input<typeof AktivSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = AktivSchema.parse(input);
  db.update(lagerorte).set({ aktiv: v.aktiv }).where(eq(lagerorte.id, v.id)).run();
  revalidatePath("/verwaltung/fahrzeuge");
}

const SollSchema = z.object({
  id: z.string().min(1).optional(),
  fahrzeugId: z.string().min(1),
  fachLabel: z.string().trim().min(1),
  artikelId: z.string().min(1),
  soll: z.coerce.number().int().positive(),
  sort: z.coerce.number().int().default(0),
});
export async function sollPositionSetzen(input: z.input<typeof SollSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = SollSchema.parse(input);
  const id = v.id ?? newId();
  if (v.id) {
    db.update(sollPositionen).set({ fahrzeugId: v.fahrzeugId, fachLabel: v.fachLabel, artikelId: v.artikelId, soll: v.soll, sort: v.sort }).where(eq(sollPositionen.id, v.id)).run();
  } else {
    db.insert(sollPositionen).values({ id, fahrzeugId: v.fahrzeugId, fachLabel: v.fachLabel, artikelId: v.artikelId, soll: v.soll, sort: v.sort }).run();
  }
  revalidatePath("/verwaltung/fahrzeuge");
  return { id };
}

const EntfernenSchema = z.object({ id: z.string().min(1) });
export async function sollPositionEntfernen(input: z.input<typeof EntfernenSchema>, db: DB = getDb()) {
  await requireAdmin();
  const v = EntfernenSchema.parse(input);
  db.delete(sollPositionen).where(eq(sollPositionen.id, v.id)).run();
  revalidatePath("/verwaltung/fahrzeuge");
}
```

- [ ] **Step 5: Test grün** — `rtk proxy pnpm vitest run src/actions/fahrzeuge.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/actions/fahrzeuge.ts src/actions/fahrzeuge.test.ts src/db/queries.ts
git commit -m "feat: fahrzeug + soll server layer (crud actions + queries)"
```

---

### Task 3: `fehlmengen`-Domäne + `checkAbschluss`-Action

**Files:**
- Create: `src/lib/domain/check.ts`
- Create: `src/lib/domain/check.test.ts`
- Create: `src/actions/check.ts`
- Create: `src/actions/check.test.ts`

**Interfaces:**
- Produces: `fehlmengen<T extends { soll: number; ist: number }>(positionen: T[]): (T & { fehlt: number })[]` (nur `fehlt = max(0, soll-ist) > 0`).
- Produces: `checkAbschluss(input: { fahrzeugId: string; positionen: { sollPositionId: string; ist: number }[] }, db?): Promise<{ checkId: string }>` (`requireHelfer`).

- [ ] **Step 1: `check.ts` + Test**

`src/lib/domain/check.ts`:
```ts
// Fehlmengen einer Ist-Erfassung gegen Soll: fehlt = max(0, soll - ist), nur > 0.
// Generisch, damit Aufrufer Positions-Identitaet (sollPositionId, artikelId) durchreichen koennen.
export function fehlmengen<T extends { soll: number; ist: number }>(positionen: T[]): (T & { fehlt: number })[] {
  return positionen.map((p) => ({ ...p, fehlt: Math.max(0, p.soll - p.ist) })).filter((p) => p.fehlt > 0);
}
```
`src/lib/domain/check.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { fehlmengen } from "./check";

describe("fehlmengen", () => {
  it("liefert fehlt=soll-ist nur fuer Unterdeckung", () => {
    const r = fehlmengen([
      { artikelId: "a", soll: 4, ist: 1 },
      { artikelId: "b", soll: 2, ist: 2 },
      { artikelId: "c", soll: 3, ist: 5 },
    ]);
    expect(r).toEqual([{ artikelId: "a", soll: 4, ist: 1, fehlt: 3 }]);
  });
  it("leere Liste wenn alles vollstaendig", () => {
    expect(fehlmengen([{ soll: 1, ist: 1 }])).toEqual([]);
  });
});
```

- [ ] **Step 2: `check.test.ts` (Action, Integration)** — `src/actions/check.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireHelfer: async () => ({ tokenId: "t1", code: "111-111" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { lagerorte, artikel, chargen, buchungen, sollPositionen, checks, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureHandlager, HANDLAGER_ID } from "@/db/seed-handlager";
import { bestand } from "@/lib/domain/bestand";
import { checkAbschluss } from "./check";

function seed() {
  const db = createTestDb();
  ensureHandlager(db);
  const fz = newId();
  db.insert(lagerorte).values({ id: fz, name: "RTW 1", typ: "fahrzeug", kennung: "XX-RK 100", aktiv: true }).run();
  const a = newId();
  db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 0, createdAt: new Date() }).run();
  const c = newId();
  db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "C1", verfall: "2028-01", createdAt: new Date() }).run();
  db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: a, chargeId: c, lagerortId: HANDLAGER_ID, menge: 10, quelleTyp: "oidc", quelleId: "u1" }).run();
  const pos = newId();
  db.insert(sollPositionen).values({ id: pos, fahrzeugId: fz, fachLabel: "S1", artikelId: a, soll: 4, sort: 0 }).run();
  return { db, fz, a, pos };
}

describe("checkAbschluss", () => {
  it("bucht je Fehlmenge FEFO-Entnahme mit referenz=check:<id>, erzeugt checks-Zeile", async () => {
    const { db, fz, a, pos } = seed();
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 1 }] }, db);
    // Fehlmenge 3 → entnahme -3 mit referenz
    const entn = db.select().from(buchungen).where(eq(buchungen.typ, "entnahme")).all();
    expect(entn).toHaveLength(1);
    expect(entn[0].menge).toBe(-3);
    expect(entn[0].referenz).toBe(`check:${checkId}`);
    expect(entn[0].quelleTyp).toBe("token");
    // Handlager-Bestand 10 → 7
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, a)).all();
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(7);
    // checks-Zeile + ergebnis
    const chk = db.select().from(checks).where(eq(checks.id, checkId)).get()!;
    expect(chk.fahrzeugId).toBe(fz);
    const erg = JSON.parse(chk.ergebnis!);
    expect(erg[0]).toMatchObject({ sollPositionId: pos, soll: 4, ist: 1, fehlt: 3, gebucht: 3 });
  });
  it("kappt gebucht am Handlager-Bestand (gebucht < fehlt)", async () => {
    const { db, fz, a, pos } = seed();
    // Bestand auf 2 reduzieren
    db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "entnahme", artikelId: a, chargeId: db.select().from(chargen).where(eq(chargen.artikelId, a)).get()!.id, lagerortId: HANDLAGER_ID, menge: -8, quelleTyp: "oidc", quelleId: "u1" }).run();
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 0 }] }, db);
    const erg = JSON.parse(db.select().from(checks).where(eq(checks.id, checkId)).get()!.ergebnis!);
    expect(erg[0]).toMatchObject({ soll: 4, ist: 0, fehlt: 4, gebucht: 2 }); // nur 2 im Lager
  });
  it("keine Fehlmenge → keine Entnahme, aber checks-Zeile existiert", async () => {
    const { db, fz, pos } = seed();
    const { checkId } = await checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: pos, ist: 4 }] }, db);
    expect(db.select().from(buchungen).where(eq(buchungen.typ, "entnahme")).all()).toHaveLength(0);
    expect(db.select().from(checks).where(eq(checks.id, checkId)).get()).toBeTruthy();
  });
  it("lehnt fremde Soll-Position ab", async () => {
    const { db, fz } = seed();
    await expect(checkAbschluss({ fahrzeugId: fz, positionen: [{ sollPositionId: "nope", ist: 0 }] }, db)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Tests rot** — `rtk proxy pnpm vitest run src/lib/domain/check.test.ts src/actions/check.test.ts` → FAIL.

- [ ] **Step 4: `src/actions/check.ts`**
```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { checks, sollPositionen, newId } from "@/db/schema";
import { requireHelfer } from "@/actions/session";
import { fefoAbbuchung } from "@/db/abbuchung";

const CheckSchema = z.object({
  fahrzeugId: z.string().min(1),
  positionen: z.array(z.object({ sollPositionId: z.string().min(1), ist: z.coerce.number().int().min(0) })).min(1),
});

// Fahrzeug-Check-Abschluss (§7 Regel 6): EINE Transaktion → checks-Zeile + je Fehlmenge
// eine FEFO-Handlager-Entnahme mit referenz="check:<id>". Soll/artikelId kommen serverseitig
// aus der sollPositionen-Zeile (per sollPositionId), nie vom Client.
export async function checkAbschluss(input: z.input<typeof CheckSchema>, db: DB = getDb()) {
  const { code } = await requireHelfer(db);
  const v = CheckSchema.parse(input);
  const checkId = newId();
  db.transaction((tx) => {
    const sollRows = tx.select().from(sollPositionen).where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all();
    const byId = new Map(sollRows.map((s) => [s.id, s]));
    const ergebnis = v.positionen.map((p) => {
      const row = byId.get(p.sollPositionId);
      if (!row) throw new Error("Soll-Position gehört nicht zu diesem Fahrzeug");
      const fehlt = Math.max(0, row.soll - p.ist);
      const gebucht = fehlt > 0
        ? fefoAbbuchung(tx, { artikelId: row.artikelId, menge: fehlt, quelle: { quelleTyp: "token", quelleId: code }, kommentar: null, referenz: `check:${checkId}` })
        : 0;
      return { sollPositionId: row.id, artikelId: row.artikelId, soll: row.soll, ist: p.ist, fehlt, gebucht };
    });
    tx.insert(checks).values({
      id: checkId, fahrzeugId: v.fahrzeugId, quelleTyp: "token", quelleId: code,
      startedAt: new Date(), completedAt: new Date(), ergebnis: JSON.stringify(ergebnis),
    }).run();
  });
  revalidatePath("/helfer/check");
  revalidatePath("/verwaltung/checks");
  revalidatePath("/verwaltung");
  return { checkId };
}
```

- [ ] **Step 5: Tests grün** — `rtk proxy pnpm vitest run src/lib/domain/check.test.ts src/actions/check.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/lib/domain/check.ts src/lib/domain/check.test.ts src/actions/check.ts src/actions/check.test.ts
git commit -m "feat: fehlmengen domain + checkAbschluss (one tx: checks row + FEFO per Fehlmenge, referenz=check)"
```

---

### Task 4: Fahrzeug-Verwaltung-UI + SideNav

**Files:**
- Create: `src/app/verwaltung/(admin)/fahrzeuge/page.tsx`
- Create: `src/app/verwaltung/(admin)/fahrzeuge/NeuFahrzeug.tsx`
- Modify: `src/components/SideNav.tsx`

**Interfaces:** Consumes `fahrzeugListe` (T2), `createFahrzeug`/`setFahrzeugAktiv` (T2), `sollFuerFahrzeug` (T2), `SollEditor` (T5).

- [ ] **Step 1: SideNav** — Import + NAV ergänzen:
```ts
import { CalendarClock, History, KeyRound, LayoutDashboard, Package, Truck, Upload } from "lucide-react";
```
NAV nach „Verfall":
```ts
  { href: "/verwaltung/fahrzeuge", label: "Fahrzeuge", icon: Truck },
```

- [ ] **Step 2: `NeuFahrzeug.tsx`** (Client, analog `NeuToken` aus M2):
```tsx
"use client";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createFahrzeug } from "@/actions/fahrzeuge";

export function NeuFahrzeug() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kennung, setKennung] = useState("");
  const [pending, start] = useTransition();
  function submit() {
    if (!name.trim()) return;
    start(async () => { await createFahrzeug({ name: name.trim(), kennung: kennung.trim() || undefined }); setName(""); setKennung(""); setOpen(false); });
  }
  if (!open) return <button className="btn btn-tinte" onClick={() => setOpen(true)}><Plus size={16} /> Neues Fahrzeug</button>;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input className="input" placeholder="Name, z. B. RTW 1" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <input className="input" placeholder="Kennung (optional)" value={kennung} onChange={(e) => setKennung(e.target.value)} />
      <button className="btn btn-rot" disabled={pending || !name.trim()} onClick={submit}>Anlegen</button>
      <button className="btn btn-ghost" onClick={() => setOpen(false)}>Abbrechen</button>
    </div>
  );
}
```

- [ ] **Step 3: `page.tsx`** (Server) — Liste der Fahrzeuge, je Fahrzeug der `SollEditor` (aus Task 5):
```tsx
import { getDb } from "@/db";
import { fahrzeugListe, sollFuerFahrzeug, artikelListe } from "@/db/queries";
import { NeuFahrzeug } from "./NeuFahrzeug";
import { SollEditor } from "./SollEditor";

export const dynamic = "force-dynamic";

export default function FahrzeugePage() {
  const db = getDb();
  const fahrzeuge = fahrzeugListe(db);
  const artikel = artikelListe(db).map((a) => ({ id: a.id, name: a.name, fach: a.fach, einheit: a.einheit }));
  return (
    <>
      <div className="mainhead" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Fahrzeuge</h1>
        <NeuFahrzeug />
      </div>
      {fahrzeuge.length === 0 && <div className="card cardpad">Noch keine Fahrzeuge. Lege oben das erste an.</div>}
      {fahrzeuge.map((f) => (
        <section key={f.id} style={{ marginTop: 12 }}>
          <div className="cardtitle">{f.name}{f.kennung ? ` · ${f.kennung}` : ""}</div>
          <SollEditor fahrzeugId={f.id} positionen={sollFuerFahrzeug(db, f.id)} artikel={artikel} />
        </section>
      ))}
    </>
  );
}
```

**Reihenfolge-Hinweis:** Task 4 legt `SollEditor.tsx` als **read-only Anzeige** an (damit die Seite eigenständig grün baut); Task 5 ersetzt genau diese Datei durch die **editierbare** Version. Kein Stub, keine ungelösten Importe.

- [ ] **Step 4: `SollEditor.tsx` (read-only Anzeige)** anlegen — Positionen nach Fach gruppiert, ohne Bearbeitung:
```tsx
import type { SollZeile } from "@/db/queries";
export function SollEditor({ fahrzeugId, positionen, artikel }: { fahrzeugId: string; positionen: SollZeile[]; artikel: { id: string; name: string; fach: string; einheit: string }[] }) {
  void fahrzeugId; void artikel;
  const faecher = [...new Set(positionen.map((p) => p.fachLabel))];
  return (
    <div className="card">
      {positionen.length === 0 && <div className="cardpad">Kein Soll definiert.</div>}
      {faecher.map((fach) => (
        <div key={fach}>
          <div className="fachhead">{fach}</div>
          {positionen.filter((p) => p.fachLabel === fach).map((p) => (
            <div className="row" key={p.id}>
              <div className="rowmain"><div className="rowname">{p.artikelName}</div><div className="rowmeta"><span className="fach">{p.handlagerFach}</span></div></div>
              <div className="bignum" style={{ fontSize: 18 }}>{p.soll}<small>{p.einheit}</small></div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```
Dann `rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm build` → grün.

- [ ] **Step 5: Commit**
```bash
git add src/app/verwaltung/\(admin\)/fahrzeuge src/components/SideNav.tsx
git commit -m "feat: fahrzeug admin page (list + create) with read-only soll display"
```

---

### Task 5: Soll-Editor-UI (editierbar)

**Files:**
- Modify: `src/app/verwaltung/(admin)/fahrzeuge/SollEditor.tsx` (read-only → editierbar, Client)

**Interfaces:** Consumes `sollPositionSetzen`/`sollPositionEntfernen` (T2).

- [ ] **Step 1: `SollEditor.tsx` als Client-Editor** ersetzen:
```tsx
"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SollZeile } from "@/db/queries";
import { sollPositionSetzen, sollPositionEntfernen } from "@/actions/fahrzeuge";

type Artikel = { id: string; name: string; fach: string; einheit: string };

export function SollEditor({ fahrzeugId, positionen, artikel }: { fahrzeugId: string; positionen: SollZeile[]; artikel: Artikel[] }) {
  const [pending, start] = useTransition();
  const [fach, setFach] = useState("");
  const [artikelId, setArtikelId] = useState("");
  const [soll, setSoll] = useState(1);

  const faecher = [...new Set(positionen.map((p) => p.fachLabel))];

  function add() {
    if (!fach.trim() || !artikelId || soll < 1) return;
    start(async () => { await sollPositionSetzen({ fahrzeugId, fachLabel: fach.trim(), artikelId, soll }); setArtikelId(""); setSoll(1); });
  }

  return (
    <div className="card">
      {positionen.length === 0 && <div className="cardpad">Kein Soll definiert – unten Positionen hinzufügen.</div>}
      {faecher.map((f) => (
        <div key={f}>
          <div className="fachhead">{f}</div>
          {positionen.filter((p) => p.fachLabel === f).map((p) => (
            <div className="row" key={p.id}>
              <div className="rowmain">
                <div className="rowname">{p.artikelName}</div>
                <div className="rowmeta"><span className="fach">{p.handlagerFach}</span><small>Bestand {p.bestand} {p.einheit}</small></div>
              </div>
              <input className="input" style={{ width: 64 }} type="number" min={1} defaultValue={p.soll}
                onBlur={(e) => { const n = Number(e.target.value); if (n >= 1 && n !== p.soll) start(async () => { await sollPositionSetzen({ id: p.id, fahrzeugId, fachLabel: p.fachLabel, artikelId: p.artikelId, soll: n, sort: p.sort }); }); }} />
              <button className="btn btn-ghost" disabled={pending} onClick={() => start(async () => { await sollPositionEntfernen({ id: p.id }); })}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      ))}
      <div className="cardpad" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--linie)" }}>
        <input className="input" placeholder="Fach, z. B. Schrank 1" value={fach} onChange={(e) => setFach(e.target.value)} style={{ minWidth: 150 }} />
        <select className="input" value={artikelId} onChange={(e) => setArtikelId(e.target.value)}>
          <option value="">Artikel wählen…</option>
          {artikel.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className="input" style={{ width: 70 }} type="number" min={1} value={soll} onChange={(e) => setSoll(Number(e.target.value))} />
        <button className="btn btn-rot" disabled={pending || !fach.trim() || !artikelId} onClick={add}><Plus size={15} /> Position</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Lint + Build** — `rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm build` → grün.

- [ ] **Step 3: Commit**
```bash
git add src/app/verwaltung/\(admin\)/fahrzeuge/SollEditor.tsx
git commit -m "feat: editable soll editor (add/update/remove positions per fach)"
```

---

### Task 6: HelferFrame 2-Tab-Navigation

**Files:**
- Modify: `src/components/HelferFrame.tsx`

**Interfaces:** Nutzt `usePathname` zur Bestimmung des aktiven Tabs — keine Prop-Änderung nötig, alle Aufrufer (`/helfer`-Layout, `/a/[id]`) bleiben unverändert.

- [ ] **Step 1: `HelferFrame.tsx` → Client mit 2 Tabs**
```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, QrCode, X } from "lucide-react";
import { beenden } from "@/app/helfer/actions";

export function HelferFrame({ tokenLabel, children }: { tokenLabel: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const checkAktiv = pathname.startsWith("/helfer/check");
  return (
    <div className="stage">
      <div className="app">
        <div className="stripe" />
        <header className="topbar">
          <div>
            <div className="brand">LAGER<span>BUCH</span></div>
            <div className="brandsub">{tokenLabel}</div>
          </div>
          <form action={beenden}>
            <button className="filter" type="submit" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <X size={13} /> Beenden
            </button>
          </form>
        </header>
        <main className="content">{children}</main>
        <nav className="tabbar">
          <Link className={`tab${checkAktiv ? "" : " on"}`} href="/helfer"><QrCode size={20} /><span>Entnahme</span></Link>
          <Link className={`tab${checkAktiv ? " on" : ""}`} href="/helfer/check"><ClipboardCheck size={20} /><span>Fahrzeug-Check</span></Link>
        </nav>
      </div>
      <div className="framecap">HELFER-ANSICHT · mobile-first, läuft auf jedem Diensthandy</div>
    </div>
  );
}
```
(`.tab`/`.tab.on` existieren in globals.css.)

- [ ] **Step 2: Typecheck + Lint + Build** — grün. (Regressions-Check: `/helfer` und `/a/{id}` rendern weiter, Entnahme-Tab aktiv.)

- [ ] **Step 3: Commit**
```bash
git add src/components/HelferFrame.tsx
git commit -m "feat: two-tab helfer nav (entnahme + fahrzeug-check) via usePathname"
```

---

### Task 7: Helfer-Check-UI (`/helfer/check`)

**Files:**
- Create: `src/app/helfer/check/page.tsx`
- Create: `src/app/helfer/check/CheckFlow.tsx`

**Interfaces:** Consumes `fahrzeugListe`/`sollFuerFahrzeug` (T2), `checkAbschluss` (T3), `fehlmengen` (T3), `Stepper`.

- [ ] **Step 1: `page.tsx`** (Server — lädt Fahrzeuge + je Fahrzeug die Soll-Positionen, reicht an den Client-Flow):
```tsx
import { getDb } from "@/db";
import { fahrzeugListe, sollFuerFahrzeug } from "@/db/queries";
import { CheckFlow } from "./CheckFlow";

export const dynamic = "force-dynamic";

export default function HelferCheckPage() {
  const db = getDb();
  const fahrzeuge = fahrzeugListe(db).filter((f) => f.aktiv);
  const soll = Object.fromEntries(fahrzeuge.map((f) => [f.id, sollFuerFahrzeug(db, f.id)]));
  return <CheckFlow fahrzeuge={fahrzeuge.map((f) => ({ id: f.id, name: f.name, kennung: f.kennung }))} soll={soll} />;
}
```

- [ ] **Step 2: `CheckFlow.tsx`** (Client — Fahrzeug wählen → Ist-Erfassung → Fehlliste → Abschluss; portiert/reduziert aus `mockup.jsx` CheckScreen Z. 447–512):
```tsx
"use client";
import { useState, useTransition } from "react";
import { Check, AlertTriangle } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { checkAbschluss } from "@/actions/check";
import { fehlmengen } from "@/lib/domain/check";

type Pos = { id: string; fachLabel: string; artikelId: string; artikelName: string; einheit: string; handlagerFach: string; soll: number; bestand: number };
type Fahrzeug = { id: string; name: string; kennung: string | null };

export function CheckFlow({ fahrzeuge, soll }: { fahrzeuge: Fahrzeug[]; soll: Record<string, Pos[]> }) {
  const [vehId, setVehId] = useState<string | null>(fahrzeuge.length === 1 ? fahrzeuge[0].id : null);
  const [ist, setIst] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (fahrzeuge.length === 0) return <div className="card cardpad">Keine Fahrzeuge angelegt. Die Verwaltung muss zuerst ein Fahrzeug + Soll pflegen.</div>;

  if (!vehId) return (
    <>
      <div className="screenhead">Fahrzeug wählen</div>
      <div className="card">
        {fahrzeuge.map((f) => (
          <button className="row" key={f.id} onClick={() => setVehId(f.id)} style={{ width: "100%", textAlign: "left", background: "none", border: 0 }}>
            <div className="rowmain"><div className="rowname">{f.name}</div>{f.kennung && <div className="rowmeta"><small>{f.kennung}</small></div>}</div>
          </button>
        ))}
      </div>
    </>
  );

  const veh = fahrzeuge.find((f) => f.id === vehId)!;
  const positionen = soll[vehId] ?? [];
  const faecher = [...new Set(positionen.map((p) => p.fachLabel))];
  const mitIst = positionen.map((p) => ({ ...p, ist: ist[p.id] ?? p.soll }));
  const fehl = fehlmengen(mitIst); // {..., fehlt}
  const fehlSumme = fehl.reduce((s, f) => s + f.fehlt, 0);

  function abschluss() {
    start(async () => {
      await checkAbschluss({ fahrzeugId: vehId!, positionen: positionen.map((p) => ({ sollPositionId: p.id, ist: ist[p.id] ?? p.soll })) });
      setMsg(`Check abgeschlossen – ${fehl.length} Fehlposition(en) abgebucht`);
      setIst({});
    });
  }

  if (msg) return (
    <>
      <div className="card cardpad"><div className="chip chip-ok" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={14} /> {msg}</div></div>
      <button className="btn btn-ghost" onClick={() => { setMsg(null); setVehId(fahrzeuge.length === 1 ? vehId : null); }}>Weiterer Check</button>
    </>
  );

  return (
    <>
      <div className="screenhead">{veh.name}{veh.kennung ? ` · ${veh.kennung}` : ""}</div>
      {positionen.length === 0 && <div className="card cardpad">Kein Soll für dieses Fahrzeug definiert.</div>}
      {faecher.map((fach) => (
        <div key={fach}>
          <div className="fachhead">{fach}</div>
          <div className="card">
            {positionen.filter((p) => p.fachLabel === fach).map((p) => {
              const wert = ist[p.id] ?? p.soll;
              const fehlt = Math.max(0, p.soll - wert);
              return (
                <div className="row" key={p.id}>
                  <div className={`checkcircle ${fehlt > 0 ? "fehl" : "done"}`}>{fehlt > 0 ? <AlertTriangle size={14} /> : <Check size={16} />}</div>
                  <div className="rowmain">
                    <div className="rowname">{p.artikelName}</div>
                    <div className="rowmeta"><small>Soll {p.soll} {p.einheit}</small>{fehlt > 0 && <span className="chip chip-rot">fehlt {fehlt}</span>}</div>
                  </div>
                  <Stepper sm wert={wert} min={0} max={p.soll} setWert={(v) => setIst((s) => ({ ...s, [p.id]: v }))} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {positionen.length > 0 && (
        <div className="summary">
          <div className="info">
            {fehlSumme > 0
              ? (<><b>{fehlSumme} Teile fehlen</b><div>{fehl.length} Position(en) aus dem Handlager · {fehl.map((f) => f.handlagerFach).join(", ")}</div></>)
              : (<><b>Alles vollständig</b><div>Check kann abgeschlossen werden</div></>)}
          </div>
          <button className="go" disabled={pending} onClick={abschluss}>Abschließen</button>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Typecheck + Lint + Build** → grün.

- [ ] **Step 4: Commit**
```bash
git add src/app/helfer/check
git commit -m "feat: mobile helfer fahrzeug-check flow (ist erfassung → fehlliste → abschluss)"
```

---

### Task 8: `checks`-Historie (Admin)

**Files:**
- Create: `src/app/verwaltung/(admin)/checks/page.tsx`
- Modify: `src/db/queries.ts` (`checkHistorie`)
- Modify: `src/components/SideNav.tsx`

**Interfaces:** Produces `checkHistorie(db): { id; fahrzeugName; completedAt; positionen; fehlPositionen; gebuchtGesamt }[]` (neueste zuerst).

- [ ] **Step 1: `checkHistorie`-Query** — in `src/db/queries.ts`:
```ts
export function checkHistorie(db: DB, limit = 50) {
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  return db.select().from(checks).orderBy(desc(checks.completedAt)).limit(limit).all().map((c) => {
    let positionen = 0, fehlPositionen = 0, gebuchtGesamt = 0;
    try {
      const erg = JSON.parse(c.ergebnis ?? "[]") as { fehlt: number; gebucht: number }[];
      positionen = erg.length;
      fehlPositionen = erg.filter((e) => e.fehlt > 0).length;
      gebuchtGesamt = erg.reduce((s, e) => s + (e.gebucht ?? 0), 0);
    } catch { /* ergebnis unlesbar → 0 */ }
    return { id: c.id, fahrzeugName: namen.get(c.fahrzeugId) ?? "–", completedAt: c.completedAt, positionen, fehlPositionen, gebuchtGesamt };
  });
}
```
(`checks` in queries.ts importieren.)

- [ ] **Step 2: SideNav** — NAV-Eintrag nach „Fahrzeuge":
```ts
  { href: "/verwaltung/checks", label: "Checks", icon: ClipboardCheck },
```
(Import `ClipboardCheck` aus lucide ergänzen.)

- [ ] **Step 3: `page.tsx`**
```tsx
import { getDb } from "@/db";
import { checkHistorie } from "@/db/queries";
import { fmtTs } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function ChecksPage() {
  const checks = checkHistorie(getDb());
  return (
    <>
      <div className="mainhead"><h1>Fahrzeug-Checks</h1></div>
      {checks.length === 0 && <div className="card cardpad">Noch keine Checks durchgeführt.</div>}
      <div className="card">
        {checks.map((c) => (
          <div className="row" key={c.id}>
            <div className="rowmain">
              <div className="rowname">{c.fahrzeugName}</div>
              <div className="rowmeta">
                <span className="jts">{c.completedAt ? fmtTs(c.completedAt) : "–"}</span>
                {c.fehlPositionen > 0
                  ? <span className="chip chip-rot">{c.fehlPositionen} Fehlpos. · {c.gebuchtGesamt} abgebucht</span>
                  : <span className="chip chip-ok">vollständig</span>}
              </div>
            </div>
            <div className="bignum" style={{ fontSize: 18 }}>{c.positionen}<small>Pos.</small></div>
          </div>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Typecheck + Lint + Build** → grün.

- [ ] **Step 5: Commit**
```bash
git add src/app/verwaltung/\(admin\)/checks src/db/queries.ts src/components/SideNav.tsx
git commit -m "feat: admin fahrzeug-check history view"
```

---

### Task 9: e2e — Check-Flow → Journal `referenz=check` + Historie

**Files:**
- Modify: `e2e/migrate-db.ts`
- Create: `e2e/check.spec.ts`

- [ ] **Step 1: Seed** — in `e2e/migrate-db.ts` idempotent ergänzen: ein Fahrzeug (`lagerorte` typ=fahrzeug, Name `"E2E RTW"`), ein Artikel mit Handlager-Bestand > 0 (falls nicht schon vorhanden aus M2/M3-Seed nutzbar), und eine Soll-Position (fachLabel `"E2E Fach"`, artikelId, soll `3`). Der bestehende aktive Token (`111-111` aus M2-Seed) wird für den Helfer-Login genutzt. IDs/Namen im Test verwenden.

- [ ] **Step 2: `e2e/check.spec.ts`**
```ts
import { test, expect } from "@playwright/test";

const CODE = "111-111"; // muss zum M2-Seed passen

test("Helfer-Check bucht Fehlmenge mit referenz=check und erscheint in der Historie", async ({ page }) => {
  // Token einlösen
  await page.goto("/");
  await page.getByLabel("Zugangs-Code").fill(CODE);
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page).toHaveURL(/\/helfer$/);

  // Check-Tab
  await page.getByRole("link", { name: /Fahrzeug-Check/ }).click();
  await expect(page).toHaveURL(/\/helfer\/check$/);

  // Fahrzeug wählen (falls Auswahl nötig)
  const veh = page.getByText("E2E RTW");
  if (await veh.count()) await veh.first().click();

  // Ist unter Soll setzen: den ersten Stepper-Minus einmal drücken (Soll 3 → Ist 2 → Fehlmenge 1)
  await page.getByRole("button", { name: "Menge verringern" }).first().click();
  await page.getByRole("button", { name: "Abschließen" }).click();
  await expect(page.getByText(/Check abgeschlossen/)).toBeVisible();

  // Admin: Historie zeigt den Check (Demo-Login)
  await page.goto("/");
  await page.getByRole("button", { name: "Demo-Login (nur Entwicklung)" }).click();
  await page.goto("/verwaltung/checks");
  await expect(page.getByText("E2E RTW").first()).toBeVisible();
});
```
**Hinweis:** Selektoren empirisch grün bekommen (Stepper-`aria-label` ist „Menge verringern" laut `Stepper.tsx`; Fahrzeugauswahl entfällt bei genau einem Fahrzeug). Die diskriminierende Assertion ist der Historie-Eintrag; optional zusätzlich `/verwaltung/journal` auf eine `entnahme`-Zeile prüfen.

- [ ] **Step 3: e2e** — `rtk proxy pnpm exec playwright test e2e/check.spec.ts` → grün.

- [ ] **Step 4: Commit**
```bash
git add e2e/check.spec.ts e2e/migrate-db.ts
git commit -m "test: e2e fahrzeug-check → referenz=check booking + admin history"
```

---

## Abschluss

Nach Task 9: `rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm test && rtk proxy pnpm build` grün. Whole-Branch-Review (adversarial), Fix-Wave, dann lokal in `main` mergen (wie M0–M3). **Kein Push.**
