# M5 Bestellung & Inventur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bestellvorschlag-Liste (+ „bestellt"-Markierung + Copy/CSV-Export) und ein Inventurmodus, dessen Abschluss je abweichender Position eine `korrektur` bucht, sodass Bestand = gezählter Ist.

**Architecture:** Reuse der Domain (`vorschlag.ts`) + des FEFO-Kerns (`fefoAbbuchung`, um `typ` erweitert). `inventurKorrektur` = eine Transaktion, Negativ-Diff via FEFO-`korrektur`, Positiv-Diff auf die jüngste/neue Charge. Kein Schema-Change, keine Inventur-Tabelle.

**Tech Stack:** Next.js 15, React 19, TS strict, Drizzle + better-sqlite3, Vitest, Playwright.

## Global Constraints

- **Design-Spec** [`docs/superpowers/specs/2026-07-12-lagerbuch-m5-bestellung-inventur-design.md`](../specs/2026-07-12-lagerbuch-m5-bestellung-inventur-design.md) ist maßgeblich.
- **Inventur-Kern (§7 Regel 7):** eine `db.transaction`; je Position `diff = ist − bestandJetzt`; `diff==0` überspringen; `diff<0` → `fefoAbbuchung(tx, {…, typ:"korrektur"})`; `diff>0` → +diff auf die **jüngste existierende** Charge (max `verfall`, Tiebreak neuestes `createdAt`), **neue Charge nur bei null Chargen** (`chargenNr="Inventur"`, `verfall="2099-12"`). NICHT den FEFO-Helfer für Positiv-Diff. Pflicht-Kommentar. `referenz="inventur:<newId()>"`. **`bestelltAt` NICHT anfassen.**
- **Invariante:** nach `inventurKorrektur` gilt `bestand(artikel) === ist` für jede korrigierte Position — das ist der zentrale Test.
- **`fefoAbbuchung`** bekommt `typ?: "entnahme" | "korrektur"` (Default `"entnahme"`); die 3 bestehenden Aufrufer (bucheEntnahme, bucheEntnahmeHelfer, checkAbschluss) bleiben unverändert grün.
- **Reuse, nicht neu bauen:** `braucht`/`vorschlagsmenge` (domain/vorschlag.ts), `config.bestellFaktor`, der `bestelltAt`-Reset in `bucheZugang`. UI-Komponenten mit Fehleranzeige (try/catch → sichtbare Meldung), Muster wie `AussondernRow`/`CheckFlow`.
- **Actions** nehmen `db: DB = getDb()`, gaten auf `requireAdmin`, zod-validiert. **RTK:** `rtk proxy pnpm …`.

---

## File Structure

**Neu:** `src/actions/bestellung.ts` (+`.test.ts`), `src/actions/inventur.ts` (+`.test.ts`), `src/app/verwaltung/(admin)/bestellung/{page,BestellListe}.tsx`, `src/app/verwaltung/(admin)/inventur/{page,InventurForm}.tsx`, `e2e/inventur.spec.ts`.
**Geändert:** `src/db/abbuchung.ts` (+`typ`), `src/actions/abbuchung`-Tests bzw. `buchung.test.ts` (typ), `src/db/queries.ts` (`bestellvorschlag`), `src/components/SideNav.tsx`, `e2e/migrate-db.ts`.

---

### Task 1: `fefoAbbuchung`-`typ`-Parameter

**Files:**
- Modify: `src/db/abbuchung.ts`
- Modify: `src/actions/buchung.test.ts`

**Interfaces:** `fefoAbbuchung(tx, args)` — `args` erhält `typ?: "entnahme" | "korrektur"` (Default `"entnahme"`).

- [ ] **Step 1: Failing test** — in `src/actions/buchung.test.ts` ergänzen (importiert `fefoAbbuchung` direkt; nutzt eine echte tx):
```ts
import { fefoAbbuchung } from "@/db/abbuchung";

describe("fefoAbbuchung typ", () => {
  it("schreibt korrektur-Zeilen wenn typ=korrektur", async () => {
    const { db, id } = seedArtikel();
    await bucheZugang({ artikelId: id, menge: 5, neueCharge: { chargenNr: "K", verfall: "2028-01" } }, db);
    db.transaction((tx) => {
      const g = fefoAbbuchung(tx, { artikelId: id, menge: 2, quelle: { quelleTyp: "oidc", quelleId: "u1" }, kommentar: "inv", referenz: "inventur:x", typ: "korrektur" });
      expect(g).toBe(2);
    });
    const korr = db.select().from(buchungen).where(eq(buchungen.typ, "korrektur")).all();
    expect(korr).toHaveLength(1);
    expect(korr[0].menge).toBe(-2);
    expect(korr[0].referenz).toBe("inventur:x");
  });
});
```

- [ ] **Step 2: Test rot** — `rtk proxy pnpm vitest run src/actions/buchung.test.ts` → FAIL (typ nicht akzeptiert / immer entnahme).

- [ ] **Step 3: `abbuchung.ts`** — `typ` in die Args + den Insert:
```ts
export function fefoAbbuchung(
  tx: Tx,
  args: { artikelId: string; menge: number; quelle: Quelle; kommentar: string | null; referenz: string | null; typ?: "entnahme" | "korrektur" },
): number {
  const { artikelId, menge, quelle, kommentar, referenz, typ = "entnahme" } = args;
  const chs = tx.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  const bu = tx.select().from(buchungen).where(eq(buchungen.artikelId, artikelId)).all();
  const rest = bestandProCharge(bu.map((b) => ({ chargeId: b.chargeId, menge: b.menge })));
  const chargenRest = chs.map((c) => ({ chargeId: c.id, verfall: c.verfall, rest: rest.get(c.id) ?? 0 }));
  let gebucht = 0;
  for (const teil of fefoVerteilung(chargenRest, menge)) {
    tx.insert(buchungen).values({
      id: newId(), ts: new Date(), typ, artikelId, chargeId: teil.chargeId,
      lagerortId: HANDLAGER_ID, menge: -teil.menge, quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
      referenz, kommentar,
    }).run();
    gebucht += teil.menge;
  }
  return gebucht;
}
```
(Nur die `typ`-Ergänzung im Args-Typ, in der Destrukturierung und im Insert; alles andere unverändert.)

- [ ] **Step 4: Tests grün** — `rtk proxy pnpm vitest run src/actions/buchung.test.ts` → PASS (alle, inkl. bestehende Entnahme). `rtk proxy pnpm typecheck`.

- [ ] **Step 5: Commit**
```bash
git add src/db/abbuchung.ts src/actions/buchung.test.ts
git commit -m "feat: add typ param to fefoAbbuchung (entnahme default, korrektur for inventur)"
```

---

### Task 2: Bestellvorschlag-Query + `markiereBestellt`-Action

**Files:**
- Modify: `src/db/queries.ts`
- Create: `src/actions/bestellung.ts`
- Create: `src/actions/bestellung.test.ts`

**Interfaces:**
- `type BestellZeile = { id; name; einheit; fach; bestand; mindestbestand; vorschlag; bestellt: boolean }`; `bestellvorschlag(db): BestellZeile[]`.
- `markiereBestellt(input: { artikelId: string; bestellt: boolean }, db?): Promise<void>`.

- [ ] **Step 1: Failing test** — `src/actions/bestellung.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/config", () => ({ config: { bestellFaktor: 2, warnTageKritisch: 31, warnTageFaellig: 56 } }));
import { createTestDb } from "@/db/testing";
import { lagerorte, artikel, chargen, buchungen, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { markiereBestellt } from "./bestellung";
import { bestellvorschlag } from "@/db/queries";

function seed() {
  const db = createTestDb();
  const now = new Date();
  const lo = newId(); db.insert(lagerorte).values({ id: lo, name: "Handlager", typ: "lager" }).run();
  // unter Mindest: bestand 2 < min 8 → vorschlag = 2*8-2 = 14
  const a = newId(); db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: 8, createdAt: now }).run();
  const c = newId(); db.insert(chargen).values({ id: c, artikelId: a, chargenNr: "C", verfall: "2028-01", createdAt: now }).run();
  db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: a, chargeId: c, lagerortId: lo, menge: 2, quelleTyp: "oidc", quelleId: "u1" }).run();
  // über Mindest: bestand 5 >= min 3 → nicht in Liste
  const b = newId(); db.insert(artikel).values({ id: b, name: "Ok", einheit: "Stk", fach: "A1", mindestbestand: 3, createdAt: now }).run();
  const cb = newId(); db.insert(chargen).values({ id: cb, artikelId: b, chargenNr: "CB", verfall: "2028-01", createdAt: now }).run();
  db.insert(buchungen).values({ id: newId(), ts: now, typ: "zugang", artikelId: b, chargeId: cb, lagerortId: lo, menge: 5, quelleTyp: "oidc", quelleId: "u1" }).run();
  return { db, a };
}

describe("bestellvorschlag + markiereBestellt", () => {
  it("listet nur Artikel unter Mindest mit korrekter Vorschlagsmenge", () => {
    const { db, a } = seed();
    const list = bestellvorschlag(db);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(a);
    expect(list[0].vorschlag).toBe(14);
    expect(list[0].bestellt).toBe(false);
  });
  it("markiereBestellt setzt und löscht bestelltAt (bestellt-Flag)", async () => {
    const { db, a } = seed();
    await markiereBestellt({ artikelId: a, bestellt: true }, db);
    expect(bestellvorschlag(db)[0].bestellt).toBe(true);
    expect(db.select().from(artikel).where(eq(artikel.id, a)).get()!.bestelltAt).not.toBeNull();
    await markiereBestellt({ artikelId: a, bestellt: false }, db);
    expect(bestellvorschlag(db)[0].bestellt).toBe(false);
  });
});
```

- [ ] **Step 2: Test rot** — `rtk proxy pnpm vitest run src/actions/bestellung.test.ts` → FAIL.

- [ ] **Step 3: `bestellvorschlag` in `queries.ts`** (Imports `braucht`, `vorschlagsmenge`, `config` sind teils vorhanden — zusammenführen):
```ts
import { braucht, vorschlagsmenge } from "@/lib/domain/vorschlag";

export type BestellZeile = { id: string; name: string; einheit: string; fach: string; bestand: number; mindestbestand: number; vorschlag: number; bestellt: boolean };

export function bestellvorschlag(db: DB): BestellZeile[] {
  const allBu = db.select().from(buchungen).all();
  return db.select().from(artikel).where(eq(artikel.aktiv, true)).all()
    .map((a) => {
      const b = bestand(allBu.filter((x) => x.artikelId === a.id).map((x) => ({ menge: x.menge })));
      return { id: a.id, name: a.name, einheit: a.einheit, fach: a.fach, bestand: b, mindestbestand: a.mindestbestand, vorschlag: vorschlagsmenge(b, a.mindestbestand, config.bestellFaktor), bestellt: Boolean(a.bestelltAt) };
    })
    .filter((z) => braucht(z.bestand, z.mindestbestand));
}
```

- [ ] **Step 4: `src/actions/bestellung.ts`**
```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { artikel } from "@/db/schema";
import { requireAdmin } from "@/actions/session";

const Schema = z.object({ artikelId: z.string().min(1), bestellt: z.boolean() });

export async function markiereBestellt(input: z.input<typeof Schema>, db: DB = getDb()) {
  await requireAdmin();
  const v = Schema.parse(input);
  db.update(artikel).set({ bestelltAt: v.bestellt ? new Date() : null }).where(eq(artikel.id, v.artikelId)).run();
  revalidatePath("/verwaltung/bestellung");
  revalidatePath("/verwaltung");
}
```

- [ ] **Step 5: Test grün** — `rtk proxy pnpm vitest run src/actions/bestellung.test.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/db/queries.ts src/actions/bestellung.ts src/actions/bestellung.test.ts
git commit -m "feat: bestellvorschlag query + markiereBestellt action"
```

---

### Task 3: `inventurKorrektur`-Action (der Kern)

**Files:**
- Create: `src/actions/inventur.ts`
- Create: `src/actions/inventur.test.ts`

**Interfaces:** `inventurKorrektur(input: { kommentar: string; positionen: { artikelId: string; ist: number }[] }, db?): Promise<{ korrigiert: number }>`.

- [ ] **Step 1: Failing test** — `src/actions/inventur.test.ts` (Fokus: die `bestand===ist`-Invariante):
```ts
import { describe, expect, it, vi } from "vitest";
vi.mock("@/actions/session", () => ({ requireAdmin: async () => ({ userId: "admin1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { createTestDb } from "@/db/testing";
import { artikel, chargen, buchungen, newId } from "@/db/schema";
import { eq } from "drizzle-orm";
import { bestand } from "@/lib/domain/bestand";
import { ensureHandlager, HANDLAGER_ID } from "@/db/seed-handlager";
import { inventurKorrektur } from "./inventur";

function seedArtikel(db, { mindest = 0, bestelltAt = null as Date | null } = {}) {
  const a = newId();
  db.insert(artikel).values({ id: a, name: "NaCl", einheit: "Fl.", fach: "B2", mindestbestand: mindest, bestelltAt, createdAt: new Date() }).run();
  return a;
}
function zugang(db, a, menge, verfall, createdAt = new Date()) {
  const c = newId();
  db.insert(chargen).values({ id: c, artikelId: a, chargenNr: `C-${verfall}`, verfall, createdAt }).run();
  db.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "zugang", artikelId: a, chargeId: c, lagerortId: HANDLAGER_ID, menge, quelleTyp: "oidc", quelleId: "u1" }).run();
  return c;
}
function bestandOf(db, a) { return bestand(db.select().from(buchungen).where(eq(buchungen.artikelId, a)).all().map((b) => ({ menge: b.menge }))); }

describe("inventurKorrektur — Invariante bestand===ist", () => {
  it("ist<bestand über mehrere Chargen (FEFO korrektur)", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const a = seedArtikel(db);
    zugang(db, a, 3, "2026-08"); zugang(db, a, 5, "2028-01"); // bestand 8
    await inventurKorrektur({ kommentar: "gezählt", positionen: [{ artikelId: a, ist: 6 }] }, db);
    expect(bestandOf(db, a)).toBe(6);
    const korr = db.select().from(buchungen).where(eq(buchungen.typ, "korrektur")).all();
    expect(korr.every((k) => k.referenz?.startsWith("inventur:"))).toBe(true);
    expect(korr.every((k) => k.menge < 0)).toBe(true);
  });
  it("ist>bestand auf jüngste Charge", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const a = seedArtikel(db);
    const cOld = zugang(db, a, 2, "2026-08"); const cNew = zugang(db, a, 2, "2028-01"); // bestand 4, jüngste = cNew
    await inventurKorrektur({ kommentar: "gezählt", positionen: [{ artikelId: a, ist: 7 }] }, db);
    expect(bestandOf(db, a)).toBe(7);
    const korr = db.select().from(buchungen).where(eq(buchungen.typ, "korrektur")).get()!;
    expect(korr.menge).toBe(3);
    expect(korr.chargeId).toBe(cNew); // jüngste (max verfall)
    void cOld;
  });
  it("ist>bestand bei Artikel OHNE Charge → neue 2099-12-Charge", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const a = seedArtikel(db); // keine Charge, bestand 0
    await inventurKorrektur({ kommentar: "erstzählung", positionen: [{ artikelId: a, ist: 5 }] }, db);
    expect(bestandOf(db, a)).toBe(5);
    const ch = db.select().from(chargen).where(eq(chargen.artikelId, a)).all();
    expect(ch).toHaveLength(1);
    expect(ch[0].verfall).toBe("2099-12");
  });
  it("ist==bestand → keine Buchung", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const a = seedArtikel(db); zugang(db, a, 4, "2028-01");
    await inventurKorrektur({ kommentar: "x", positionen: [{ artikelId: a, ist: 4 }] }, db);
    expect(db.select().from(buchungen).where(eq(buchungen.typ, "korrektur")).all()).toHaveLength(0);
  });
  it("erzwingt Pflicht-Kommentar", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const a = seedArtikel(db); zugang(db, a, 4, "2028-01");
    await expect(inventurKorrektur({ kommentar: "  ", positionen: [{ artikelId: a, ist: 2 }] }, db)).rejects.toThrow();
  });
  it("lässt bestelltAt unverändert", async () => {
    const db = createTestDb(); ensureHandlager(db);
    const bestellt = new Date("2026-01-01");
    const a = seedArtikel(db, { bestelltAt: bestellt }); zugang(db, a, 4, "2028-01");
    await inventurKorrektur({ kommentar: "x", positionen: [{ artikelId: a, ist: 2 }] }, db);
    expect(db.select().from(artikel).where(eq(artikel.id, a)).get()!.bestelltAt?.getTime()).toBe(bestellt.getTime());
  });
});
```

- [ ] **Step 2: Test rot** — `rtk proxy pnpm vitest run src/actions/inventur.test.ts` → FAIL.

- [ ] **Step 3: `src/actions/inventur.ts`**
```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "@/db";
import { buchungen, chargen, newId } from "@/db/schema";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { requireAdmin } from "@/actions/session";
import { fefoAbbuchung } from "@/db/abbuchung";

const Schema = z.object({
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
  positionen: z.array(z.object({ artikelId: z.string().min(1), ist: z.coerce.number().int().min(0) })).min(1),
});

// Inventur (§7 Regel 7): je Position diff = ist - bestandJetzt. diff==0 -> skip.
// diff<0 -> FEFO-korrektur. diff>0 -> +diff auf die juengste existierende Charge (max verfall,
// Tiebreak neuestes createdAt), neue Charge nur wenn keine existiert. Alles in EINER Transaktion.
export async function inventurKorrektur(input: z.input<typeof Schema>, db: DB = getDb()) {
  const { userId } = await requireAdmin();
  const v = Schema.parse(input);
  const referenz = `inventur:${newId()}`;
  let korrigiert = 0;
  db.transaction((tx) => {
    for (const p of v.positionen) {
      const bu = tx.select().from(buchungen).where(eq(buchungen.artikelId, p.artikelId)).all();
      const bestandJetzt = bu.reduce((s, b) => s + b.menge, 0);
      const diff = p.ist - bestandJetzt;
      if (diff === 0) continue;
      if (diff < 0) {
        fefoAbbuchung(tx, { artikelId: p.artikelId, menge: -diff, quelle: { quelleTyp: "oidc", quelleId: userId }, kommentar: v.kommentar, referenz, typ: "korrektur" });
      } else {
        const chs = tx.select().from(chargen).where(eq(chargen.artikelId, p.artikelId)).all();
        let chargeId: string;
        if (chs.length > 0) {
          const juengste = chs.slice().sort((a, b) => b.verfall.localeCompare(a.verfall) || (b.createdAt.getTime() - a.createdAt.getTime()))[0];
          chargeId = juengste.id;
        } else {
          chargeId = newId();
          tx.insert(chargen).values({ id: chargeId, artikelId: p.artikelId, chargenNr: "Inventur", verfall: "2099-12", createdAt: new Date() }).run();
        }
        tx.insert(buchungen).values({ id: newId(), ts: new Date(), typ: "korrektur", artikelId: p.artikelId, chargeId, lagerortId: HANDLAGER_ID, menge: diff, quelleTyp: "oidc", quelleId: userId, referenz, kommentar: v.kommentar }).run();
      }
      korrigiert++;
    }
  });
  revalidatePath("/verwaltung/inventur");
  revalidatePath("/verwaltung/artikel");
  revalidatePath("/verwaltung");
  return { korrigiert };
}
```

- [ ] **Step 4: Tests grün** — `rtk proxy pnpm vitest run src/actions/inventur.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/actions/inventur.ts src/actions/inventur.test.ts
git commit -m "feat: inventurKorrektur (FEFO korrektur for shortfall, youngest/new charge for surplus)"
```

---

### Task 4: Bestellvorschlag-UI + Export + SideNav

**Files:**
- Create: `src/app/verwaltung/(admin)/bestellung/page.tsx`
- Create: `src/app/verwaltung/(admin)/bestellung/BestellListe.tsx`
- Modify: `src/components/SideNav.tsx`

**Interfaces:** Consumes `bestellvorschlag` (T2), `markiereBestellt` (T2).

- [ ] **Step 1: SideNav** — Import + NAV ergänzen:
```ts
import { CalendarClock, ClipboardCheck, ClipboardList, History, KeyRound, LayoutDashboard, Package, ShoppingCart, Truck, Upload } from "lucide-react";
```
NAV nach „Checks" (Reihenfolge frei, aber vor Journal sinnvoll):
```ts
  { href: "/verwaltung/bestellung", label: "Bestellung", icon: ShoppingCart },
  { href: "/verwaltung/inventur", label: "Inventur", icon: ClipboardList },
```

- [ ] **Step 2: `page.tsx`**
```tsx
import { getDb } from "@/db";
import { bestellvorschlag } from "@/db/queries";
import { BestellListe } from "./BestellListe";

export const dynamic = "force-dynamic";

export default function BestellungPage() {
  const zeilen = bestellvorschlag(getDb());
  return (
    <>
      <div className="mainhead"><h1>Bestellvorschlag</h1></div>
      <p className="footnote" style={{ marginBottom: 12 }}>Automatisch aus den Buchungen abgeleitet · Vorschlag = Faktor × Mindestbestand − Bestand. „Bestellt" setzt sich beim nächsten Zugang automatisch zurück.</p>
      <BestellListe zeilen={zeilen} />
    </>
  );
}
```

- [ ] **Step 3: `BestellListe.tsx`** (Client — Toggle + Export mit Fehleranzeige):
```tsx
"use client";
import { useState, useTransition } from "react";
import { Check, Copy, Download } from "lucide-react";
import { markiereBestellt } from "@/actions/bestellung";

type Zeile = { id: string; name: string; einheit: string; fach: string; bestand: number; mindestbestand: number; vorschlag: number; bestellt: boolean };

function csvCell(s: string | number) { return `"${String(s).replaceAll('"', '""')}"`; }

export function BestellListe({ zeilen }: { zeilen: Zeile[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (zeilen.length === 0) return <div className="card cardpad">Alles über Mindestbestand – nichts zu bestellen.</div>;

  function toggle(z: Zeile) {
    setErr(null);
    start(async () => {
      try { await markiereBestellt({ artikelId: z.id, bestellt: !z.bestellt }); }
      catch (e) { setErr(e instanceof Error ? e.message : "Fehler beim Markieren"); }
    });
  }
  function copyList() {
    const txt = zeilen.filter((z) => !z.bestellt).map((z) => `${z.vorschlag} × ${z.name}`).join("\n");
    navigator.clipboard.writeText(txt).then(() => setMsg("Bestellliste kopiert")).catch(() => setErr("Kopieren fehlgeschlagen"));
  }
  function downloadCsv() {
    const head = ["Artikel", "Bestand", "Mindestbestand", "Vorschlag", "Einheit", "Status"].map(csvCell).join(";");
    const rows = zeilen.map((z) => [z.name, z.bestand, z.mindestbestand, z.vorschlag, z.einheit, z.bestellt ? "bestellt" : "offen"].map(csvCell).join(";"));
    const blob = new Blob([[head, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "bestellvorschlag.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button className="btn btn-ghost" onClick={copyList}><Copy size={15} /> Liste kopieren</button>
        <button className="btn btn-ghost" onClick={downloadCsv}><Download size={15} /> CSV</button>
      </div>
      {msg && <div className="chip chip-ok" style={{ marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={14} /> {msg}</div>}
      {err && <div className="gateerr" style={{ marginBottom: 8 }}>{err}</div>}
      <div className="card">
        {zeilen.map((z) => (
          <div className="row" key={z.id}>
            <button className={`checkcircle ${z.bestellt ? "done" : ""}`} disabled={pending}
              aria-label={z.bestellt ? "Bestellung zurücknehmen" : "Als bestellt markieren"} onClick={() => toggle(z)}>
              {z.bestellt && <Check size={15} />}
            </button>
            <div className="rowmain">
              <div className="rowname" style={z.bestellt ? { textDecoration: "line-through", color: "var(--stahl)" } : undefined}>{z.name}</div>
              <div className="rowmeta"><span className="fach">{z.fach}</span><small>Bestand {z.bestand} / min. {z.mindestbestand}</small>
                {z.bestellt ? <span className="chip chip-ok">bestellt</span> : <span className="chip chip-rot">offen</span>}</div>
            </div>
            <div className="bignum" style={{ fontSize: 20 }}>{z.vorschlag}<small>{z.einheit}</small></div>
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
git add src/app/verwaltung/\(admin\)/bestellung src/components/SideNav.tsx
git commit -m "feat: bestellvorschlag page with mark-ordered toggle + copy/CSV export"
```

---

### Task 5: Inventur-UI

**Files:**
- Create: `src/app/verwaltung/(admin)/inventur/page.tsx`
- Create: `src/app/verwaltung/(admin)/inventur/InventurForm.tsx`

**Interfaces:** Consumes `artikelListe` (bestehend, liefert `bestand`), `inventurKorrektur` (T3).

- [ ] **Step 1: `page.tsx`**
```tsx
import { getDb } from "@/db";
import { artikelListe } from "@/db/queries";
import { InventurForm } from "./InventurForm";

export const dynamic = "force-dynamic";

export default function InventurPage() {
  const artikel = artikelListe(getDb()).map((a) => ({ id: a.id, name: a.name, einheit: a.einheit, fach: a.fach, bestand: a.bestand }));
  return (
    <>
      <div className="mainhead"><h1>Inventur</h1></div>
      <p className="footnote" style={{ marginBottom: 12 }}>Gezählten Ist-Wert je Artikel eintragen. Abweichungen werden beim Abschluss als Korrektur gebucht (Bestand = Ist). Ein Pflicht-Kommentar dokumentiert die Zählung.</p>
      <InventurForm artikel={artikel} />
    </>
  );
}
```

- [ ] **Step 2: `InventurForm.tsx`** (Client — Ist je Artikel, Pflicht-Kommentar, Abschluss mit Fehleranzeige):
```tsx
"use client";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Stepper } from "@/components/Stepper";
import { inventurKorrektur } from "@/actions/inventur";

type Artikel = { id: string; name: string; einheit: string; fach: string; bestand: number };

export function InventurForm({ artikel }: { artikel: Artikel[] }) {
  const [ist, setIst] = useState<Record<string, number>>({});
  const [kommentar, setKommentar] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const abweichungen = artikel.filter((a) => (ist[a.id] ?? a.bestand) !== a.bestand);

  function abschluss() {
    setErr(null);
    if (!kommentar.trim()) { setErr("Kommentar erforderlich"); return; }
    start(async () => {
      try {
        const r = await inventurKorrektur({ kommentar: kommentar.trim(), positionen: artikel.map((a) => ({ artikelId: a.id, ist: ist[a.id] ?? a.bestand })) });
        setMsg(`Inventur gebucht – ${r.korrigiert} Position(en) korrigiert`);
        setIst({}); setKommentar("");
      } catch (e) { setErr(e instanceof Error ? e.message : "Fehler bei der Inventur"); }
    });
  }

  if (msg) return (
    <>
      <div className="card cardpad"><div className="chip chip-ok" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Check size={14} /> {msg}</div></div>
    </>
  );

  return (
    <>
      {artikel.length === 0 && <div className="card cardpad">Keine Artikel vorhanden.</div>}
      <div className="card">
        {artikel.map((a) => {
          const wert = ist[a.id] ?? a.bestand;
          const diff = wert - a.bestand;
          return (
            <div className="row" key={a.id}>
              <div className="rowmain">
                <div className="rowname">{a.name}</div>
                <div className="rowmeta"><span className="fach">{a.fach}</span><small>Bestand {a.bestand} {a.einheit}</small>
                  {diff !== 0 && <span className={`chip ${diff < 0 ? "chip-rot" : "chip-gelb"}`}>{diff > 0 ? "+" : ""}{diff}</span>}</div>
              </div>
              <Stepper sm min={0} max={9999} wert={wert} setWert={(v) => setIst((s) => ({ ...s, [a.id]: v }))} />
            </div>
          );
        })}
      </div>
      <div className="card cardpad" style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <input className="input" placeholder="Kommentar (Pflicht), z. B. Quartalsinventur 07/2026" value={kommentar} onChange={(e) => { setKommentar(e.target.value); setErr(null); }} />
        {err && <div className="gateerr">{err}</div>}
        <button className="btn btn-rot" disabled={pending || !kommentar.trim()} onClick={abschluss}>
          Inventur abschließen ({abweichungen.length} Abweichung{abweichungen.length === 1 ? "" : "en"})
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Typecheck + Lint + Build** → grün.

- [ ] **Step 4: Commit**
```bash
git add src/app/verwaltung/\(admin\)/inventur
git commit -m "feat: inventur mode (count ist per article → korrektur so bestand==ist)"
```

---

### Task 6: e2e — Inventur (Bestand==Ist) + Bestellung-Toggle

**Files:**
- Create: `e2e/inventur.spec.ts`
- Modify: `e2e/migrate-db.ts` (bei Bedarf; nutzt bestehende Artikel mit Bestand)

**Interfaces:** Demo-Login (Admin), bestehende Seed-Artikel.

- [ ] **Step 1: Seed prüfen** — sicherstellen, dass `e2e/migrate-db.ts` mindestens einen Artikel mit Bestand > 0 und einen unter Mindestbestand seedet (aus M2/M3 vermutlich vorhanden). Falls ein dediziert benennbarer Artikel fehlt, einen idempotent ergänzen (Name im Test verwenden).

- [ ] **Step 2: `e2e/inventur.spec.ts`** (Demo-Login-Muster wie `e2e/verwaltung-flow.spec.ts`):
```ts
import { test, expect } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo-Login (nur Entwicklung)" }).click();
  await expect(page).toHaveURL(/\/verwaltung/);
}

test("Inventur korrigiert einen Artikel auf den gezählten Ist-Wert", async ({ page }) => {
  await login(page);
  await page.goto("/verwaltung/inventur");
  // ersten Artikel um 1 verringern (Ist < Bestand)
  await page.getByRole("button", { name: "Menge verringern" }).first().click();
  await page.getByPlaceholder(/Kommentar/).fill("e2e-Zählung");
  await page.getByRole("button", { name: /Inventur abschließen/ }).click();
  await expect(page.getByText(/Inventur gebucht/)).toBeVisible();
  // Journal zeigt eine Korrektur
  await page.goto("/verwaltung/journal");
  await expect(page.getByText("Korrektur").first()).toBeVisible();
});

test("Bestellung: Artikel als bestellt markieren toggelt den Status", async ({ page }) => {
  await login(page);
  await page.goto("/verwaltung/bestellung");
  const firstToggle = page.getByRole("button", { name: /markieren/ }).first();
  if (await firstToggle.count()) {
    await firstToggle.click();
    await expect(page.getByText("bestellt").first()).toBeVisible();
  }
});
```
**Hinweis:** Selektoren empirisch grün bekommen; `typLabel("korrektur")` = „Korrektur" (aus format.ts). Falls die Bestellliste im e2e-Seed leer ist, greift der `if`-Guard.

- [ ] **Step 3: e2e** — `rtk proxy pnpm exec playwright test e2e/inventur.spec.ts` → grün.

- [ ] **Step 4: Commit**
```bash
git add e2e/inventur.spec.ts e2e/migrate-db.ts
git commit -m "test: e2e inventur (bestand==ist) + bestellung toggle"
```

---

## Abschluss

Nach Task 6: `rtk proxy pnpm typecheck && rtk proxy pnpm lint && rtk proxy pnpm test && rtk proxy pnpm build` grün. Whole-Branch-Review (adversarial), Fix-Wave, dann lokal in `main` mergen (wie M0–M4). **Kein Push.**
