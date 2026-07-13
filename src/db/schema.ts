import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const newId = () => nanoid();

export const lagerorte = sqliteTable("lagerorte", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  typ: text("typ", { enum: ["lager", "fahrzeug"] }).notNull(),
  kennung: text("kennung"),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
});

export const artikel = sqliteTable("artikel", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  einheit: text("einheit").notNull(),
  fach: text("fach").notNull(),
  mindestbestand: integer("mindestbestand").notNull().default(0),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  bestelltAt: integer("bestellt_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const chargen = sqliteTable(
  "chargen",
  {
    id: text("id").primaryKey(),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    chargenNr: text("chargen_nr").notNull(),
    verfall: text("verfall").notNull(), // "YYYY-MM"
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_chargen_artikel_verfall").on(t.artikelId, t.verfall)],
);

export const buchungen = sqliteTable(
  "buchungen",
  {
    id: text("id").primaryKey(),
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    typ: text("typ", { enum: ["zugang", "entnahme", "korrektur", "umlagerung"] }).notNull(),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    chargeId: text("charge_id").notNull().references(() => chargen.id),
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    menge: integer("menge").notNull(), // signed: zugang +, entnahme −
    quelleTyp: text("quelle_typ", { enum: ["token", "oidc", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),
    referenz: text("referenz"),
    kommentar: text("kommentar"),
  },
  (t) => [
    index("idx_buchungen_artikel").on(t.artikelId),
    index("idx_buchungen_charge").on(t.chargeId),
    index("idx_buchungen_ts").on(t.ts),
  ],
);

export const sollPositionen = sqliteTable(
  "soll_positionen",
  {
    id: text("id").primaryKey(),
    fahrzeugId: text("fahrzeug_id").notNull().references(() => lagerorte.id),
    fachLabel: text("fach_label").notNull(),
    sort: integer("sort").notNull().default(0),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    soll: integer("soll").notNull(),
  },
  (t) => [index("idx_soll_fahrzeug").on(t.fahrzeugId)],
);

export const tokens = sqliteTable("tokens", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  scopeLagerortId: text("scope_lagerort_id").references(() => lagerorte.id), // null = Handlager
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
  ergebnis: text("ergebnis"),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // OIDC sub
  name: text("name"),
  email: text("email"),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
});

// ── BZ-Kontroll-Logbuch ─────────────────────────────────────────────────────

export const bzGeraete = sqliteTable(
  "bz_geraete",
  {
    id: text("id").primaryKey(),
    // Seriennummer/Barcode am Gerät (Deep-Link /g/[code]). Eindeutig, aber optional
    // bei Handanlage — daher unique + nullable (SQLite erlaubt mehrere NULL in UNIQUE).
    barcode: text("barcode").unique(),
    name: text("name").notNull(),
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    // Aktueller Teststreifen-Lot + zwei Kontroll-Level als Referenzbereiche (min/max, bar-frei).
    // Nullable, weil ein frisch angelegtes Gerät noch keine Streifen-Charge hat.
    streifenLot: text("streifen_lot"),
    level1Label: text("level1_label"),           // z. B. "Level 3"
    level1Min: integer("level1_min"),            // z. B. 127
    level1Max: integer("level1_max"),            // z. B. 157
    level2Label: text("level2_label"),           // z. B. "Level 4"
    level2Min: integer("level2_min"),            // z. B. 309
    level2Max: integer("level2_max"),            // z. B. 387
    aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_bz_geraete_lagerort").on(t.lagerortId)],
);

export const bzKontrollen = sqliteTable(
  "bz_kontrollen",
  {
    id: text("id").primaryKey(),
    geraetId: text("geraet_id").notNull().references(() => bzGeraete.id),
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    quelleTyp: text("quelle_typ", { enum: ["oidc", "token", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),        // userId bzw. Token-Code (wer)
    // Gemessene Kontroll-Werte je Level + ob im Referenzbereich (zum Messzeitpunkt).
    level1Wert: integer("level1_wert"),
    level1ImBereich: integer("level1_im_bereich", { mode: "boolean" }),
    level2Wert: integer("level2_wert"),
    level2ImBereich: integer("level2_im_bereich", { mode: "boolean" }),
    // Kompresse-Verfall als "YYYY-MM" (wie chargen.verfall); ok/abgelaufen wird berechnet.
    kompresseVerfall: text("kompresse_verfall"),
    sticks: integer("sticks").notNull().default(0),        // Anzahl Teststreifen
    lanzetten: integer("lanzetten").notNull().default(0),  // Anzahl Lanzetten
    batterieGewechselt: integer("batterie_gewechselt", { mode: "boolean" }).notNull().default(false),
    kommentar: text("kommentar"),
    bestanden: integer("bestanden", { mode: "boolean" }).notNull(),   // Gesamtergebnis
    // Nachweisfester Snapshot der Referenzbereiche/Streifen-Lot zum Messzeitpunkt.
    refSnapshot: text("ref_snapshot"),   // JSON.stringify({ streifenLot, level1Min, ... })
  },
  (t) => [index("idx_bz_kontrollen_geraet_ts").on(t.geraetId, t.ts)],
);

// ── Sauerstoff-Verwaltung ───────────────────────────────────────────────────

export const o2Flaschen = sqliteTable(
  "o2_flaschen",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),                 // Name/Kennung
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    groesseLiter: integer("groesse_liter"),       // optional
    nennfuelldruckBar: integer("nennfuelldruck_bar").notNull().default(200),
    aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_o2_flaschen_lagerort").on(t.lagerortId)],
);

export const o2Messungen = sqliteTable(
  "o2_messungen",
  {
    id: text("id").primaryKey(),
    flascheId: text("flasche_id").notNull().references(() => o2Flaschen.id),
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    druckBar: integer("druck_bar").notNull(),
    quelleTyp: text("quelle_typ", { enum: ["oidc", "token", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),
    kommentar: text("kommentar"),
  },
  (t) => [index("idx_o2_messungen_flasche_ts").on(t.flascheId, t.ts)],
);
