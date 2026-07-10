# Lagerbuch M1b — Verwaltung (klickbar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully clickable Verwaltung: server actions (Artikel-CRUD, Zugang, FEFO-Entnahme, CSV-Import via Korrektur) built on M1a's domain layer + data layer, wired into the ported Mockup UI (Übersicht with KPIs, Artikel table + Charge drawer, Journal). After this, the lagerwart can create articles, book stock in/out, and read the journal — the app is daily-useful.

**Architecture:** Server Components load data via a thin read layer (`src/db/queries.ts`) and compute status with M1a's pure domain functions; mutations go through zod-validated Server Actions (`src/actions/*`) that write append-only `buchungen` (Bestand is always `SUM(menge)`) — FEFO entnahme distributes over chargen in a single SQLite transaction. Interactivity (drawers, steppers) lives in small client components that invoke the actions and `revalidatePath` to refresh. All admin bookings carry `quelleTyp:"oidc"`, `quelleId: session.user.id`, `lagerortId:"handlager"`.

**Tech Stack:** builds entirely on the merged M0+M1a `main` — Next 15 App Router (Server Components + Server Actions), Drizzle/better-sqlite3, the `src/lib/domain/*` functions, Auth.js session, existing `globals.css` classes, lucide-react. Vitest (integration against `:memory:`), Playwright.

## Global Constraints

- **Builds on M1a (already on `main`).** Reuse — do NOT reimplement: domain functions `bestand`/`bestandProCharge` (`@/lib/domain/bestand`), `verfallStatus` (`@/lib/domain/verfall`), `fefoVerteilung` + `ChargeRest` (`@/lib/domain/fefo`), `braucht`/`vorschlagsmenge` (`@/lib/domain/vorschlag`); the DB (`getDb`, `DB`, `newId`, schema tables from `@/db`/`@/db/schema`); `createTestDb()` (`@/db/testing`) for integration tests; `config` (warnTageKritisch/faellig, bestellFaktor); `auth()` (`@/auth`) for the session.
- **Bestand is never stored** — always `SUM(buchungen.menge)` filtered by artikel/charge. The journal is append-only (triggers enforce it); corrections are new `korrektur` rows.
- **Every admin booking**: `quelleTyp:"oidc"`, `quelleId: session.user.id`, `lagerortId:"handlager"`, `ts: new Date()`, `id: newId()`. Zugang `menge` is positive; entnahme rows are negative; korrektur signed with a **mandatory** `kommentar`.
- **FEFO entnahme** uses `fefoVerteilung` over chargen with `rest>0` ascending by `verfall`, one `buchungen` row per affected charge, the whole distribution in ONE `db.transaction(...)`, capped at total Bestand; the action returns the actually-booked amount.
- **Zugang** requires a charge: an existing charge id, or a new charge (`chargenNr` + `verfall` `YYYY-MM`; pseudo-charge "ohne Verfall" = `verfall:"2099-12"`). On any Zugang for an article, clear its `bestelltAt` (`null`).
- **Handlager lagerort**: a single default lagerort `{id:"handlager", name:"Handlager", typ:"lager"}` must exist before bookings — ensured idempotently at startup (Task 1).
- **Server Actions**: files start with `"use server"`, validate inputs with zod, read the session via `auth()` and reject non-admins, and call `revalidatePath("/verwaltung/…")` after writing.
- **UI**: port markup/wording/flows from `mockup.jsx` `AdminView`; reuse existing `globals.css` classes (`.adm/.side/.main/.card/.tbl/.kpi/.drawer/.stepper/.chip/.fach/.bignum/.journal…`). New admin pages MUST live inside the `src/app/verwaltung/(admin)/` route group (so the admin layout guard applies). No personal data (public repo).
- **Currency of truth for the mockup demo logic**: the mockup is a UI reference only; its in-memory `buchen`/`fefoEntnahme` are replaced by the real actions. Do not copy its client-state mutations.
- Run tests with `pnpm test` (use `rtk proxy pnpm …` if the shell RTK hook mangles output). Local run: `mise run dev` (demo login). Commit per task; do NOT push. Trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014kZuFZYQZXBQN7VXP82hc2
  ```

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `src/instrumentation.ts` (modify) | also ensure the default Handlager lagerort exists | 1 |
| `src/db/seed-handlager.ts` | idempotent `ensureHandlager(db)` (+ used by tests) | 1 |
| `src/db/queries.ts` (+ test) | read layer: artikel-with-bestand, detail, journal, kennzahlen | 2 |
| `src/actions/artikel.ts` (+ test) | `createArtikel`, `updateArtikel` | 3 |
| `src/actions/buchung.ts` (+ test) | `bucheZugang`, `bucheEntnahme` (FEFO tx) | 4, 5 |
| `src/actions/csv.ts` (+ test) | `parseArtikelCsv` (pure) + `importArtikelCsv` (Korrektur startbestand) | 6 |
| `src/components/Plakette.tsx`, `Stepper.tsx` | ported charge badge + stepper (client) | 7 |
| `src/app/verwaltung/(admin)/layout.tsx` (modify) | sidebar nav (Übersicht/Artikel/Journal) + sign-out | 8 |
| `src/app/verwaltung/(admin)/page.tsx` (modify) | Übersicht: KPIs + kritische Artikel + letzte Buchungen | 8 |
| `src/app/verwaltung/(admin)/artikel/page.tsx` + `ArtikelTable.tsx` + `NeuArtikel.tsx` | Artikel list + new | 9 |
| `src/app/verwaltung/(admin)/artikel/ArtikelDrawer.tsx` | detail drawer: stammdaten, Zugang/Entnahme, chargen | 10 |
| `src/app/verwaltung/(admin)/journal/page.tsx` | Journal table | 11 |
| `src/app/verwaltung/(admin)/import/page.tsx` + `ImportForm.tsx` | CSV import UI | 11 |
| `e2e/verwaltung-flow.spec.ts` | happy path: create → zugang → entnahme → journal | 12 |

---

## Task 1: Handlager bootstrap

**Files:**
- Create: `src/db/seed-handlager.ts`, `src/db/seed-handlager.test.ts`
- Modify: `src/instrumentation.ts`

**Interfaces:**
- Produces: `ensureHandlager(db: DB): void` — idempotently inserts `{id:"handlager", name:"Handlager", typ:"lager", aktiv:true}` (insert, on-conflict-do-nothing). `HANDLAGER_ID = "handlager"` exported.

- [ ] **Step 1: Failing test** — `src/db/seed-handlager.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/testing";
import { lagerorte } from "@/db/schema";
import { ensureHandlager, HANDLAGER_ID } from "./seed-handlager";

describe("ensureHandlager", () => {
  it("creates the Handlager lagerort once and is idempotent", () => {
    const db = createTestDb();
    ensureHandlager(db);
    ensureHandlager(db);
    const rows = db.select().from(lagerorte).where(eq(lagerorte.id, HANDLAGER_ID)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].typ).toBe("lager");
  });
});
```

- [ ] **Step 2: Run → FAIL** (`rtk proxy pnpm test src/db/seed-handlager.test.ts`).

- [ ] **Step 3: Implement `src/db/seed-handlager.ts`**
```ts
import type { DB } from "@/db";
import { lagerorte } from "@/db/schema";

export const HANDLAGER_ID = "handlager";

export function ensureHandlager(db: DB): void {
  db.insert(lagerorte)
    .values({ id: HANDLAGER_ID, name: "Handlager", typ: "lager", aktiv: true })
    .onConflictDoNothing()
    .run();
}
```

- [ ] **Step 4: Wire into `src/instrumentation.ts`** — after `applyMigrations(getDb())`, also call it:
```ts
const { ensureHandlager } = await import("@/db/seed-handlager");
applyMigrations(getDb());
ensureHandlager(getDb());
```
(Keep the existing `assertProductionSecrets(config)` call and the `NEXT_RUNTIME==="nodejs"` guard.)

- [ ] **Step 5: Run → GREEN**; full `rtk proxy pnpm test` + `typecheck` green.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: ensure default Handlager lagerort at startup"`

---

## Task 2: Read layer (queries)

**Files:**
- Create: `src/db/queries.ts`, `src/db/queries.test.ts`

**Interfaces:**
- Produces (all take `db: DB`):
  - `type ArtikelZeile = { id; name; einheit; fach; mindestbestand; bestand: number; naechsteCharge: { chargenNr; verfall } | null }`
  - `artikelListe(db): ArtikelZeile[]` — active articles with `bestand = SUM(menge)` and the earliest-verfall charge that still has rest>0.
  - `type ChargeZeile = { id; chargenNr; verfall; rest: number }`
  - `artikelDetail(db, id): { artikel; bestand; chargen: ChargeZeile[]; buchungen: {ts;typ;menge;kommentar;quelleId}[] } | null`
  - `journalEintraege(db, limit?): { id; ts; artikelName; typ; menge; quelleId; kommentar }[]` (newest first)
  - `kennzahlen(db): { unterMindest: number; chargenKritisch: number; offeneBestellungen: number; buchungenGesamt: number }` — uses `verfallStatus`/`braucht`/`config`.

- [ ] **Step 1: Failing test** — `src/db/queries.test.ts` seeds an article with two chargen and a few buchungen via a small helper, then asserts:
```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, lagerorte, newId } from "@/db/schema";
import { artikelListe, artikelDetail, journalEintraege, kennzahlen } from "./queries";

function seed() {
  const db = createTestDb();
  const now = new Date();
  const lo = newId(); db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
  const a = newId(); db.insert(artikel).values({ id: a, name: "Mullbinde", einheit: "Stk.", fach: "A2", mindestbestand: 20, createdAt: now }).run();
  const cEarly = newId(); db.insert(chargen).values({ id: cEarly, artikelId: a, chargenNr: "E", verfall: "2026-08", createdAt: now }).run();
  const cLate = newId(); db.insert(chargen).values({ id: cLate, artikelId: a, chargenNr: "L", verfall: "2028-01", createdAt: now }).run();
  db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cEarly, lagerortId: lo, menge: 4, quelleTyp: "oidc", quelleId: "u1" }).run();
  db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: cLate, lagerortId: lo, menge: 6, quelleTyp: "oidc", quelleId: "u1" }).run();
  return { db, a, cEarly };
}

describe("queries", () => {
  it("artikelListe returns bestand=SUM and the earliest charge with rest", () => {
    const { db } = seed();
    const rows = artikelListe(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].bestand).toBe(10);
    expect(rows[0].naechsteCharge?.chargenNr).toBe("E"); // 2026-08 before 2028-01
  });
  it("artikelDetail returns chargen with rest and recent buchungen", () => {
    const { db, a, cEarly } = seed();
    const d = artikelDetail(db, a)!;
    expect(d.bestand).toBe(10);
    const early = d.chargen.find((c) => c.id === cEarly)!;
    expect(early.rest).toBe(4);
    expect(d.buchungen.length).toBeGreaterThanOrEqual(2);
  });
  it("kennzahlen flags under-mindestbestand", () => {
    const { db } = seed(); // bestand 10 < mindest 20
    expect(kennzahlen(db).unterMindest).toBe(1);
  });
  it("journalEintraege lists newest first with artikel name", () => {
    const { db } = seed();
    const j = journalEintraege(db, 10);
    expect(j[0].artikelName).toBe("Mullbinde");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/db/queries.ts`** — use Drizzle to load rows, then aggregate with the domain functions. Sketch (fill in fully):
```ts
import { desc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { artikel, buchungen, chargen } from "@/db/schema";
import { bestand, bestandProCharge } from "@/lib/domain/bestand";
import { verfallStatus } from "@/lib/domain/verfall";
import { braucht } from "@/lib/domain/vorschlag";
import { config } from "@/lib/config";

export type ChargeZeile = { id: string; chargenNr: string; verfall: string; rest: number };
export type ArtikelZeile = {
  id: string; name: string; einheit: string; fach: string; mindestbestand: number;
  bestand: number; naechsteCharge: { chargenNr: string; verfall: string } | null;
};

// helper: rest per charge for one article
function chargenMitRest(db: DB, artikelId: string): ChargeZeile[] {
  const chs = db.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, artikelId)).all();
  const rest = bestandProCharge(bu.map((b) => ({ chargeId: b.chargeId, menge: b.menge })));
  return chs.map((c) => ({ id: c.id, chargenNr: c.chargenNr, verfall: c.verfall, rest: rest.get(c.id) ?? 0 }));
}

export function artikelListe(db: DB): ArtikelZeile[] {
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  return arts.map((a) => {
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, a.id)).all();
    const chargenRest = chargenMitRest(db, a.id).filter((c) => c.rest > 0).sort((x, y) => x.verfall.localeCompare(y.verfall));
    const naechste = chargenRest[0] ?? null;
    return {
      id: a.id, name: a.name, einheit: a.einheit, fach: a.fach, mindestbestand: a.mindestbestand,
      bestand: bestand(bu.map((b) => ({ menge: b.menge }))),
      naechsteCharge: naechste ? { chargenNr: naechste.chargenNr, verfall: naechste.verfall } : null,
    };
  });
}

export function artikelDetail(db: DB, id: string) {
  const a = db.select().from(artikel).where(eq(artikel.id, id)).get();
  if (!a) return null;
  const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).orderBy(desc(buchungen.ts)).all();
  return {
    artikel: a,
    bestand: bestand(bu.map((b) => ({ menge: b.menge }))),
    chargen: chargenMitRest(db, id),
    buchungen: bu.slice(0, 8).map((b) => ({ ts: b.ts, typ: b.typ, menge: b.menge, kommentar: b.kommentar, quelleId: b.quelleId })),
  };
}

export function journalEintraege(db: DB, limit = 100) {
  const rows = db.select().from(buchungen).orderBy(desc(buchungen.ts)).limit(limit).all();
  const names = new Map(db.select().from(artikel).all().map((a) => [a.id, a.name]));
  return rows.map((b) => ({
    id: b.id, ts: b.ts, artikelName: names.get(b.artikelId) ?? "–",
    typ: b.typ, menge: b.menge, quelleId: b.quelleId, kommentar: b.kommentar,
  }));
}

export function kennzahlen(db: DB) {
  const now = new Date();
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  let unterMindest = 0, offeneBestellungen = 0;
  for (const a of arts) {
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, a.id)).all();
    const b = bestand(bu.map((x) => ({ menge: x.menge })));
    if (braucht(b, a.mindestbestand)) { unterMindest++; if (!a.bestelltAt) offeneBestellungen++; }
  }
  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };
  const chs = db.select().from(chargen).all();
  const chargenKritisch = chs.filter((c) => {
    const s = verfallStatus(c.verfall, opts, now);
    return s.ampel !== "gruen";
  }).length;
  const buchungenGesamt = db.select().from(buchungen).all().length;
  return { unterMindest, chargenKritisch, offeneBestellungen, buchungenGesamt };
}
```

- [ ] **Step 4: Run → GREEN**; full test + typecheck green.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: add verwaltung read-layer queries with tests"`

---

## Task 3: Actions — Artikel CRUD

**Files:**
- Create: `src/actions/artikel.ts`, `src/actions/artikel.test.ts`
- Create: `src/actions/session.ts` (small shared helper `requireAdmin()`)

**Interfaces:**
- `requireAdmin(): Promise<{ userId: string }>` — reads `auth()`, throws if not admin, else returns the user id (from `session.user.id`).
- `createArtikel(input): Promise<{ id: string }>` — zod `{ name, einheit, fach, mindestbestand }`; inserts an `artikel` (aktiv true, createdAt now); `revalidatePath`.
- `updateArtikel(id, input): Promise<void>` — zod partial `{ name?, einheit?, fach?, mindestbestand? }`; updates stammdaten.
- The action functions accept an injected `db` in tests (default `getDb()`), so integration tests can pass `createTestDb()`. Pattern: `export async function createArtikel(input, db: DB = getDb())`.

- [ ] **Step 1: Failing test** — `src/actions/artikel.test.ts` (call with an injected test db, bypassing the session by testing the core logic; see note). Because `requireAdmin` needs a session, expose the DB-writing core as a separately testable function OR mock `auth`. Use this structure:
```ts
import { describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/db/testing";
import { artikel } from "@/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "test-admin" }) }));

import { createArtikel, updateArtikel } from "./artikel";

describe("artikel actions", () => {
  it("creates an active article", async () => {
    const db = createTestDb();
    const { id } = await createArtikel({ name: "Kompressen", einheit: "Pkg.", fach: "A3", mindestbestand: 30 }, db);
    const row = db.select().from(artikel).where(eq(artikel.id, id)).get()!;
    expect(row.name).toBe("Kompressen");
    expect(row.aktiv).toBe(true);
  });
  it("updates stammdaten", async () => {
    const db = createTestDb();
    const { id } = await createArtikel({ name: "X", einheit: "Stk.", fach: "A1", mindestbestand: 5 }, db);
    await updateArtikel(id, { mindestbestand: 12, fach: "B1" }, db);
    const row = db.select().from(artikel).where(eq(artikel.id, id)).get()!;
    expect(row.mindestbestand).toBe(12);
    expect(row.fach).toBe("B1");
  });
  it("rejects an empty name", async () => {
    const db = createTestDb();
    await expect(createArtikel({ name: "", einheit: "Stk.", fach: "A1", mindestbestand: 5 }, db)).rejects.toThrow();
  });
});
```
Note the `revalidatePath` import must not break tests — import it from `next/cache`; in a Vitest node env it is a no-op-safe call, but if it throws, guard it: wrap calls in a tiny `safeRevalidate(path)` that try/catches, OR the test can `vi.mock("next/cache", () => ({ revalidatePath: () => {} }))`. Use the `vi.mock("next/cache", …)` approach in the test file.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/actions/session.ts`**
```ts
import { auth } from "@/auth";

export async function requireAdmin(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.isAdmin) throw new Error("Kein Zugriff");
  return { userId: session.user.id };
}
```
and `src/actions/artikel.ts`:
```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "@/db";
import { artikel, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/actions/session";

const CreateSchema = z.object({
  name: z.string().trim().min(1),
  einheit: z.string().trim().min(1),
  fach: z.string().trim().min(1),
  mindestbestand: z.coerce.number().int().min(0),
});

export async function createArtikel(input: z.input<typeof CreateSchema>, db: DB = getDb()) {
  await requireAdmin();
  const data = CreateSchema.parse(input);
  const id = newId();
  db.insert(artikel).values({ id, ...data, aktiv: true, createdAt: new Date() }).run();
  revalidatePath("/verwaltung/artikel");
  return { id };
}

const UpdateSchema = CreateSchema.partial();

export async function updateArtikel(id: string, input: z.input<typeof UpdateSchema>, db: DB = getDb()) {
  await requireAdmin();
  const data = UpdateSchema.parse(input);
  db.update(artikel).set(data).where(eq(artikel.id, id)).run();
  revalidatePath("/verwaltung/artikel");
}
```

- [ ] **Step 4: Run → GREEN**; full test + typecheck + lint green.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: add artikel create/update server actions with tests"`

---

## Task 4: Action — Zugang

**Files:**
- Create: `src/actions/buchung.ts`, `src/actions/buchung.test.ts`

**Interfaces:**
- `bucheZugang(input, db?): Promise<void>` — zod `{ artikelId, menge (int>0), chargeId? , neueCharge?: { chargenNr, verfall "YYYY-MM" } }`. Exactly one of `chargeId` / `neueCharge`. Inserts a new charge if `neueCharge`; inserts one `zugang` buchung (`+menge`) on that charge; sets `artikel.bestelltAt = null`; `revalidatePath`.

- [ ] **Step 1: Failing test** (mock session + next/cache as in Task 3) covering: zugang to an existing charge raises Bestand; zugang with a new charge creates the charge + booking; zugang clears `bestelltAt`.
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bestand } from "@/lib/domain/bestand";
import { bucheZugang } from "./buchung";

function seedArtikel(db = createTestDb()) {
  const id = newId();
  db.insert(artikel).values({ id, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 8, bestelltAt: new Date(), createdAt: new Date() }).run();
  return { db, id };
}

describe("bucheZugang", () => {
  it("creates a new charge and books +menge", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 5, neueCharge: { chargenNr: "N1", verfall: "2028-06" } }, db);
    expect(db.select().from(chargen).where(eq(chargen.artikelId, id)).all()).toHaveLength(1);
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).all();
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(5);
  });
  it("clears bestelltAt on zugang", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 3, neueCharge: { chargenNr: "N", verfall: "2099-12" } }, db);
    expect(db.select().from(artikel).where(eq(artikel.id, id)).get()!.bestelltAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `bucheZugang` in `src/actions/buchung.ts`**
```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { artikel, buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { requireAdmin } from "@/actions/session";

const ZugangSchema = z.object({
  artikelId: z.string().min(1),
  menge: z.coerce.number().int().positive(),
  chargeId: z.string().min(1).optional(),
  neueCharge: z.object({ chargenNr: z.string().trim().min(1), verfall: z.string().regex(/^\d{4}-\d{2}$/) }).optional(),
}).refine((v) => Boolean(v.chargeId) !== Boolean(v.neueCharge), { message: "Genau eine Charge angeben" });

export async function bucheZugang(input: z.input<typeof ZugangSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = ZugangSchema.parse(input);
  db.transaction((tx) => {
    let chargeId = v.chargeId!;
    if (v.neueCharge) {
      chargeId = newId();
      tx.insert(chargen).values({ id: chargeId, artikelId: v.artikelId, chargenNr: v.neueCharge.chargenNr, verfall: v.neueCharge.verfall, createdAt: new Date() }).run();
    }
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ: "zugang", artikelId: v.artikelId, chargeId,
      lagerortId: HANDLAGER_ID, menge: v.menge, quelleTyp: "oidc", quelleId: userId, kommentar: null,
    }).run();
    tx.update(artikel).set({ bestelltAt: null }).where(eq(artikel.id, v.artikelId)).run();
  });
  revalidatePath("/verwaltung/artikel");
  revalidatePath("/verwaltung");
}
```

- [ ] **Step 4: Run → GREEN.** **Step 5: Commit** — `git add -A && git commit -m "feat: add zugang server action with tests"`

---

## Task 5: Action — Entnahme (FEFO, transactional)

**Files:**
- Modify: `src/actions/buchung.ts`, `src/actions/buchung.test.ts`

**Interfaces:**
- `bucheEntnahme(input, db?): Promise<{ gebucht: number }>` — zod `{ artikelId, menge (int>0), kommentar? }`. Loads chargen-with-rest, calls `fefoVerteilung`, writes one negative `entnahme` buchung per charge in ONE transaction, caps at Bestand, returns the actually-booked total.

- [ ] **Step 1: Failing test** — add to `buchung.test.ts`: FEFO takes from the earliest charge first; splits across chargen; caps at Bestand.
```ts
import { bucheEntnahme } from "./buchung";
// seed an artikel with two chargen (earliest rest 3, later rest 10) via zugang, then:
it("entnahme distributes FEFO and caps at Bestand", async () => {
  const { db, id } = seedArtikel();
  await bucheZugang({ artikelId: id, menge: 3, neueCharge: { chargenNr: "E", verfall: "2026-08" } }, db);
  await bucheZugang({ artikelId: id, menge: 10, neueCharge: { chargenNr: "L", verfall: "2028-01" } }, db);
  const { gebucht } = await bucheEntnahme({ artikelId: id, menge: 5 }, db);
  expect(gebucht).toBe(5);
  // earliest charge fully drained (3), later charge -2 → bestand 8
  const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, id)).all();
  expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(8);
});
it("caps entnahme at available Bestand", async () => {
  const { db, id } = seedArtikel();
  await bucheZugang({ artikelId: id, menge: 3, neueCharge: { chargenNr: "E", verfall: "2026-08" } }, db);
  const { gebucht } = await bucheEntnahme({ artikelId: id, menge: 99 }, db);
  expect(gebucht).toBe(3);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `bucheEntnahme`** (append to `buchung.ts`)
```ts
import { fefoVerteilung } from "@/lib/domain/fefo";
import { bestandProCharge } from "@/lib/domain/bestand";

const EntnahmeSchema = z.object({
  artikelId: z.string().min(1),
  menge: z.coerce.number().int().positive(),
  kommentar: z.string().trim().optional(),
});

export async function bucheEntnahme(input: z.input<typeof EntnahmeSchema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = EntnahmeSchema.parse(input);
  let gebucht = 0;
  db.transaction((tx) => {
    const chs = tx.select().from(chargen).where(eq(chargen.artikelId, v.artikelId)).all();
    const bu = tx.select().from(buchungen).where(eq(buchungen.artikelId, v.artikelId)).all();
    const rest = bestandProCharge(bu.map((b) => ({ chargeId: b.chargeId, menge: b.menge })));
    const chargenRest = chs.map((c) => ({ chargeId: c.id, verfall: c.verfall, rest: rest.get(c.id) ?? 0 }));
    const verteilung = fefoVerteilung(chargenRest, v.menge);
    for (const teil of verteilung) {
      tx.insert(buchungen).values({
        id: newId(), ts: new Date(), typ: "entnahme", artikelId: v.artikelId, chargeId: teil.chargeId,
        lagerortId: HANDLAGER_ID, menge: -teil.menge, quelleTyp: "oidc", quelleId: userId,
        kommentar: v.kommentar ?? null,
      }).run();
      gebucht += teil.menge;
    }
  });
  revalidatePath("/verwaltung/artikel");
  revalidatePath("/verwaltung");
  return { gebucht };
}
```

- [ ] **Step 4: Run → GREEN.** **Step 5: Commit** — `git add -A && git commit -m "feat: add FEFO entnahme server action (transactional) with tests"`

---

## Task 6: CSV import (pure parse + import action)

**Files:**
- Create: `src/actions/csv.ts`, `src/actions/csv.test.ts`

**Interfaces:**
- `parseArtikelCsv(text): { rows: {name;einheit;fach;mindestbestand;startbestand}[]; errors: string[] }` — pure. Header `name,einheit,fach,mindestbestand,startbestand`; `;` or `,` delimiter tolerated; blank lines skipped; bad rows collected in `errors` (not thrown).
- `importArtikelCsv(text, db?): Promise<{ angelegt: number; fehler: string[] }>` — for each valid row: create the artikel; if `startbestand>0`, create an "ohne Verfall" charge (`2099-12`) and a `korrektur` buchung `+startbestand` with `kommentar:"CSV-Startbestand"`.

- [ ] **Step 1: Failing test** — parse: valid rows + a malformed row → errors; import creates artikel + a korrektur startbestand booking.
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { artikel, buchungen } from "@/db/schema";
import { bestand } from "@/lib/domain/bestand";
import { parseArtikelCsv, importArtikelCsv } from "./csv";

describe("csv", () => {
  it("parses valid rows and collects errors", () => {
    const csv = "name,einheit,fach,mindestbestand,startbestand\nMullbinde,Stk.,A2,20,24\nkaputt\n";
    const r = parseArtikelCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.errors.length).toBe(1);
  });
  it("imports articles with a Korrektur startbestand booking", async () => {
    const db = createTestDb();
    const csv = "name,einheit,fach,mindestbestand,startbestand\nKompressen,Pkg.,A3,30,40\n";
    const res = await importArtikelCsv(csv, db);
    expect(res.angelegt).toBe(1);
    const a = db.select().from(artikel).all()[0];
    const bu = db.select().from(buchungen).all();
    expect(bu[0].typ).toBe("korrektur");
    expect(bestand(bu.map((b) => ({ menge: b.menge })))).toBe(40);
    expect(a.name).toBe("Kompressen");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/actions/csv.ts`** (`parseArtikelCsv` pure; `importArtikelCsv` uses `requireAdmin`, `HANDLAGER_ID`, inserts artikel + charge `2099-12` + `korrektur` booking with `kommentar:"CSV-Startbestand"`). Keep it in a transaction per row. Full code — follow the schema/patterns from Tasks 3–5.

- [ ] **Step 4: Run → GREEN.** **Step 5: Commit** — `git add -A && git commit -m "feat: add CSV article import (parse + korrektur startbestand) with tests"`

---

## Task 7: Plakette + Stepper components

**Files:**
- Create: `src/components/Plakette.tsx`, `src/components/Stepper.tsx`

**Interfaces:**
- `Plakette({ verfall, ampel })` — the SVG charge badge ported from `mockup.jsx` (the `Plakette` function), but takes the pre-computed `ampel` ("rot"|"gelb"|"gruen") from the server (do NOT recompute dates in the component — the server passes `verfallStatus(...).ampel`). Client component only if needed; otherwise a pure presentational component.
- `Stepper({ wert, setWert, min?, max?, sm? })` — ported `Stepper` (client, `"use client"`), unchanged behavior.

- [ ] **Step 1** Port both from `mockup.jsx`. For `Plakette`, replace the internal `verfallStatus` date logic with the `ampel` prop → color; keep the SVG ticks + `fmtVerfall` label. `Stepper` ports verbatim (add `"use client"`).
- [ ] **Step 2** `rtk proxy pnpm typecheck` + `pnpm lint` clean.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: port Plakette and Stepper components"`

---

## Task 8: Verwaltung sidebar layout + Übersicht

**Files:**
- Modify: `src/app/verwaltung/(admin)/layout.tsx` (add sidebar nav), `src/app/verwaltung/(admin)/page.tsx` (Übersicht)

**Interfaces:**
- Layout: the ported `.adm/.side` sidebar with nav links (Übersicht `/verwaltung`, Artikel `/verwaltung/artikel`, Journal `/verwaltung/journal`, Import `/verwaltung/import`), highlighting the active route, + the existing sign-out. Keep the `session.user.isAdmin` guard.
- Übersicht page (server): `const db = getDb(); const k = kennzahlen(db);` render the 4 `.kpi` cards + a "Kritische Artikel" card (articles under mindestbestand or with a non-green charge, using `artikelListe` + `verfallStatus`) + "Letzte Buchungen" (`journalEintraege(db, 5)`). `export const dynamic = "force-dynamic"`.

- [ ] **Step 1** Implement the layout sidebar (port `.side`/`.snav`/`.sitem` markup; a small client `NavLink` using `usePathname` for the active state, or server-side compare via `headers()`—prefer a tiny client `SideNav`).
- [ ] **Step 2** Implement the Übersicht server page using the queries + domain functions (KPIs, kritische Artikel, letzte Buchungen), wording from the mockup `Uebersicht`.
- [ ] **Step 3** `rtk proxy pnpm build` + `typecheck` + `lint` green. Manual check via `mise run dev`: after demo-login, `/verwaltung` shows KPIs (all zero on an empty DB is fine).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: verwaltung sidebar nav + Übersicht KPIs"`

---

## Task 9: Artikel table + Neuer-Artikel

**Files:**
- Create: `src/app/verwaltung/(admin)/artikel/page.tsx`, `src/app/verwaltung/(admin)/artikel/ArtikelTable.tsx`, `.../NeuArtikel.tsx`

**Interfaces:**
- `artikel/page.tsx` (server, `force-dynamic`): loads `artikelListe(getDb())`, computes each row's status chips (unter Mindestbestand via `braucht`; nächste Charge ampel via `verfallStatus`) and passes plain data to `ArtikelTable` (client) which renders the `.tbl` and opens the drawer (Task 10) on row click. `NeuArtikel` (client) is a drawer/form calling `createArtikel`.

- [ ] **Step 1** Implement the server page (data + status), `ArtikelTable` client (ported `.tbl` markup, row click → drawer state), `NeuArtikel` client (form → `createArtikel` → close + refresh via `router.refresh()`).
- [ ] **Step 2** e2e-lite manual: create an article via the form, see it appear.
- [ ] **Step 3** build + typecheck + lint green. **Commit** — `git add -A && git commit -m "feat: artikel table and new-artikel form"`

---

## Task 10: Artikel detail drawer (Zugang/Entnahme/Chargen)

**Files:**
- Create: `src/app/verwaltung/(admin)/artikel/ArtikelDrawer.tsx`
- Modify: `ArtikelTable.tsx` (open the drawer with the selected id), `artikel/page.tsx` (pass `artikelDetail` loader or a server action to fetch detail)

**Interfaces:**
- `ArtikelDrawer` (client) shows: Bestand + Mindestbestand (edit via `updateArtikel`), Fach/Einheit, a Buchung block (Stepper + Zugang/Entnahme buttons calling `bucheZugang`/`bucheEntnahme`), a Chargen list (Plakette + rest + `verfallStatus` chip, and a "neue Charge" add via `bucheZugang` with `neueCharge`), and the last bookings. Fetch detail via a server action `getDetail(id)` (wraps `artikelDetail`) so the drawer refreshes after each booking.

- [ ] **Step 1** Add a `getDetail` server action returning `artikelDetail`. Build the drawer wiring Stepper + the actions; after each action call `router.refresh()` and re-fetch detail. Port markup/wording from the mockup `Drawer`.
- [ ] **Step 2** Manual check via `mise run dev`: open an article, add a charge via Zugang, then Entnahme — Bestand + chargen update; Journal reflects it.
- [ ] **Step 3** build + typecheck + lint green. **Commit** — `git add -A && git commit -m "feat: artikel detail drawer with zugang/entnahme/chargen"`

---

## Task 11: Journal page + CSV import UI

**Files:**
- Create: `src/app/verwaltung/(admin)/journal/page.tsx`, `.../import/page.tsx`, `.../import/ImportForm.tsx`

**Interfaces:**
- Journal (server, `force-dynamic`): `journalEintraege(getDb())` → the `.tbl` journal (Zeit, Artikel, Vorgang, Δ, Quelle) with `.jdelta` +/- coloring, wording from the mockup `Journal`.
- Import (server page + client `ImportForm`): a textarea to paste CSV + a submit calling `importArtikelCsv`; show `{angelegt, fehler}` result. Link the expected header format.

- [ ] **Step 1** Implement both pages. **Step 2** build + typecheck + lint green; manual check: paste a 2-line CSV → articles appear with startbestand in the journal.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: journal page and CSV import UI"`

---

## Task 12: E2E happy path

**Files:**
- Create: `e2e/verwaltung-flow.spec.ts`

**Interfaces:**
- The M1 happy path against a demo-login dev server (Playwright webServer already sets `AUTH_DEV_LOGIN`): login → Artikel → Neuer Artikel → open it → Zugang with a new charge → Entnahme → Journal shows a `entnahme` row. Uses a fresh temp `DATABASE_PATH` per run so state is clean.

- [ ] **Step 1** Add the spec. Ensure `playwright.config.ts` webServer sets a throwaway `DATABASE_PATH` (e.g. `./.data/e2e.db`) and `AUTH_DEV_LOGIN=true`; delete that file before the run (a global-setup or a step) so the flow starts from empty.
- [ ] **Step 2** `rtk proxy pnpm e2e` → GREEN. Then full `rtk proxy pnpm test` + `typecheck` + `lint` + `build` — all green.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: e2e verwaltung happy path (create → zugang → entnahme → journal)"`

---

## Self-Review

**Spec coverage (design spec §5 M1 UI/actions + plan §7):** Artikel-CRUD (T3), Zugang w/ charge (T4), Entnahme FEFO transactional + capping (T5), Journal (T11), Übersicht/Bestandsliste (T8/T9), CSV-Import as Korrektur startbestand (T6). Bestand = SUM everywhere via `artikelListe`/`artikelDetail`/`kennzahlen` (T2). Append-only preserved (only inserts). Handlager bootstrap (T1). Plakette/Stepper reuse (T7). Happy-path e2e (T12).

**Deferred (later milestones, by design):** Chargen "aussondern"/warnlists dashboard (M3), Soll-Bestückung + Fahrzeug-Check (M4), full Bestellvorschlag UI + Inventur mode (M5), Tokens/Helfer (M2), Etiketten (M6). The `bestelltAt` reset-on-zugang is wired (T4) but its Bestellung UI is M5.

**Placeholder scan:** Tasks 6, 8–11 give structure + interfaces + the exact data/domain calls and cite the mockup section to port; the executor writes the JSX against the existing CSS classes. Tasks 1–5 (the testable logic) carry complete code. No `TODO`/`TBD`.

**Type consistency:** action signatures take `db: DB = getDb()` (testable); `requireAdmin` returns `{userId}`; query return shapes (`ArtikelZeile`/`ChargeZeile`/detail) are consumed by T8–T11; `Plakette` takes a precomputed `ampel`. `HANDLAGER_ID` from T1 used by T4/T5/T6. `fefoVerteilung`/`bestandProCharge`/`verfallStatus`/`braucht` reused from M1a unchanged.

**Risk notes:** (1) `revalidatePath`/`next/cache` in unit tests — the tests `vi.mock("next/cache")`; keep that. (2) Server actions calling `auth()` need the request context — tests mock `@/actions/session`. (3) `db.transaction` with better-sqlite3 is synchronous — the callbacks are sync (no `await` inside). (4) UI tasks are verified by `pnpm build` + a manual `mise run dev` check + the T12 e2e; if a Server/Client boundary error appears (e.g. passing a function to a client component), split the component correctly and report.
