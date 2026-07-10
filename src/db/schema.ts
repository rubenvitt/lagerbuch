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
    typ: text("typ", { enum: ["zugang", "entnahme", "korrektur"] }).notNull(),
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
  scopeLagerortId: text("scope_lagerort_id").references(() => lagerorte.id),
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
