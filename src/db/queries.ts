import { desc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { artikel, buchungen, chargen, tokens, lagerorte, sollPositionen, checks, fahrzeugTemplates, templatePositionen } from "@/db/schema";
import { bestandProCharge, bestandProLagerort, bestandProLagerortUndCharge } from "@/lib/domain/bestand";
import { HANDLAGER_ID } from "@/db/seed-handlager";
import { verfallStatus } from "@/lib/domain/verfall";
import type { Ampel } from "@/lib/domain/verfall";
import { braucht, vorschlagsmenge } from "@/lib/domain/vorschlag";
import { config } from "@/lib/config";
import { chargeText } from "@/lib/format";

export type ChargeZeile = { id: string; chargenNr: string; verfall: string; rest: number };
export type ArtikelZeile = {
  id: string;
  name: string;
  einheit: string;
  fach: string;
  mindestbestand: number;
  bestand: number;
  aktiv: boolean;
  naechsteCharge: { chargenNr: string; verfall: string } | null;
};

// helper: rest per charge for one article AT ONE lagerort (default Handlager). Since vehicles now
// carry their own bookings, an unscoped rest would sum Handlager + Fahrzeug for the same charge.
function chargenMitRest(db: DB, artikelId: string, lagerortId: string = HANDLAGER_ID): ChargeZeile[] {
  const chs = db.select().from(chargen).where(eq(chargen.artikelId, artikelId)).all();
  const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, artikelId)).all();
  const rest = bestandProCharge(bu.filter((b) => b.lagerortId === lagerortId).map((b) => ({ chargeId: b.chargeId, menge: b.menge })));
  return chs.map((c) => ({ id: c.id, chargenNr: c.chargenNr, verfall: c.verfall, rest: rest.get(c.id) ?? 0 }));
}

export function artikelListe(db: DB, opts: { inklInaktiv?: boolean } = {}): ArtikelZeile[] {
  const arts = opts.inklInaktiv
    ? db.select().from(artikel).all()
    : db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  return arts.map((a) => {
    const bu = db.select().from(buchungen).where(eq(buchungen.artikelId, a.id)).all();
    const chargenRest = chargenMitRest(db, a.id)
      .filter((c) => c.rest > 0)
      .sort((x, y) => x.verfall.localeCompare(y.verfall));
    const naechste = chargenRest[0] ?? null;
    return {
      id: a.id,
      name: a.name,
      einheit: a.einheit,
      fach: a.fach,
      mindestbestand: a.mindestbestand,
      aktiv: a.aktiv,
      // Verwaltungsliste zeigt den HANDLAGER-Bestand (nicht fahrzeuginklusiv).
      bestand: bestandProLagerort(bu.map((b) => ({ lagerortId: b.lagerortId, menge: b.menge })), HANDLAGER_ID),
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
    // Admin-Detail: Handlager-Bestand + Handlager-Chargen. Der Buchungs-Verlauf bleibt bewusst
    // lagerort-übergreifend (zeigt auch Umlagerungen aufs Fahrzeug als Aktivität).
    bestand: bestandProLagerort(bu.map((b) => ({ lagerortId: b.lagerortId, menge: b.menge })), HANDLAGER_ID),
    chargen: chargenMitRest(db, id),
    buchungen: bu.slice(0, 8).map((b) => ({ ts: b.ts, typ: b.typ, menge: b.menge, kommentar: b.kommentar, quelleId: b.quelleId })),
  };
}

export function journalEintraege(db: DB, limit = 100) {
  const rows = db.select().from(buchungen).orderBy(desc(buchungen.ts)).limit(limit).all();
  const names = new Map(db.select().from(artikel).all().map((a) => [a.id, a.name]));
  return rows.map((b) => ({
    id: b.id,
    ts: b.ts,
    artikelName: names.get(b.artikelId) ?? "–",
    typ: b.typ,
    menge: b.menge,
    quelleId: b.quelleId,
    kommentar: b.kommentar,
  }));
}

export function kennzahlen(db: DB) {
  const now = new Date();
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();
  const allBu = db.select().from(buchungen).all();
  // Verfall-KPIs zählen nur den HANDLAGER-Rest je Charge — konsistent mit verfallListe() und der
  // Aussondern-Aktion (beide Handlager-gebunden). Fahrzeug-Chargen laufen ggf. dort ab und werden
  // über den nächsten Fahrzeug-Check bereinigt, nicht über die Handlager-Verfallsliste.
  const restProCharge = bestandProLagerortUndCharge(allBu.map((x) => ({ lagerortId: x.lagerortId, chargeId: x.chargeId, menge: x.menge })), HANDLAGER_ID);

  let unterMindest = 0,
    offeneBestellungen = 0;
  for (const a of arts) {
    // Mindestbestand ist eine HANDLAGER-Nachschubschwelle → nur Handlager-Bestand zählt.
    const b = bestandProLagerort(allBu.filter((x) => x.artikelId === a.id).map((x) => ({ lagerortId: x.lagerortId, menge: x.menge })), HANDLAGER_ID);
    if (braucht(b, a.mindestbestand)) {
      unterMindest++;
      if (!a.bestelltAt) offeneBestellungen++;
    }
  }

  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };
  let chargenKritisch = 0;
  let chargenAbgelaufen = 0;
  for (const c of db.select().from(chargen).all()) {
    if ((restProCharge.get(c.id) ?? 0) <= 0) continue; // depleted → kein Risiko
    const s = verfallStatus(c.verfall, opts, now);
    if (s.abgelaufen) chargenAbgelaufen++;
    else if (s.ampel !== "gruen") chargenKritisch++;
  }

  const buchungenGesamt = allBu.length;
  return { unterMindest, chargenKritisch, chargenAbgelaufen, offeneBestellungen, buchungenGesamt };
}

export function artikelDetailHelfer(db: DB, id: string) {
  const d = artikelDetail(db, id);
  if (!d) return null;
  const now = new Date();
  const opts = { kritisch: config.warnTageKritisch, faellig: config.warnTageFaellig };
  const chargen = d.chargen
    .filter((c) => c.rest > 0)
    .map((c) => {
      const s = verfallStatus(c.verfall, opts, now);
      return { ...c, ampel: s.ampel, text: chargeText(s, c.verfall) };
    })
    .sort((a, b) => a.verfall.localeCompare(b.verfall));
  return {
    id: d.artikel.id,
    name: d.artikel.name,
    einheit: d.artikel.einheit,
    fach: d.artikel.fach,
    bestand: d.bestand,
    chargen,
  };
}

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
  // Verfallsliste = HANDLAGER-Rest je Charge (siehe kennzahlen): eine komplett aufs Fahrzeug
  // umgelagerte abgelaufene Charge erscheint nicht mehr hier, sonst würde der Aussondern-Button
  // (Handlager-only) reproduzierbar fehlschlagen.
  const rest = bestandProLagerortUndCharge(
    db.select().from(buchungen).all().map((b) => ({ lagerortId: b.lagerortId, chargeId: b.chargeId, menge: b.menge })),
    HANDLAGER_ID,
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

export function fahrzeugListe(db: DB) {
  return db.select().from(lagerorte).where(eq(lagerorte.typ, "fahrzeug")).all()
    .map((f) => ({ id: f.id, name: f.name, kennung: f.kennung, aktiv: f.aktiv, templateId: f.templateId }));
}

export type FahrzeugUebersichtZeile = {
  id: string; name: string; kennung: string | null; aktiv: boolean;
  positionen: number; // Anzahl Soll-Positionen
  faecher: number; // Anzahl unterschiedlicher Fächer
  artikelUnterSoll: number; // Artikel, deren Fahrzeugbestand die Soll-Summe unterschreitet
  letzterCheck: Date | null; // completedAt des jüngsten Checks
  templateName: string | null; // verknüpfte Vorlage, falls vorhanden
};

// Verdichtete Übersicht für die Fahrzeugliste: pro Fahrzeug nur Kennzahlen (kein Soll-Editor),
// damit die Seite bei vielen Fahrzeugen scanbar bleibt. Details/Bearbeiten liegen auf /[id].
export function fahrzeugUebersicht(db: DB): FahrzeugUebersichtZeile[] {
  const fahrzeuge = db.select().from(lagerorte).where(eq(lagerorte.typ, "fahrzeug")).all();
  const allBu = db.select().from(buchungen).all();
  // Grabsteine (entfernt) zählen nirgends als Soll.
  const allSoll = db.select().from(sollPositionen).all().filter((s) => !s.entfernt);
  const templateNamen = new Map(db.select().from(fahrzeugTemplates).all().map((t) => [t.id, t.name]));
  const letzterProFzg = new Map<string, Date>();
  for (const c of db.select().from(checks).all()) {
    if (!c.completedAt) continue;
    const prev = letzterProFzg.get(c.fahrzeugId);
    if (!prev || c.completedAt > prev) letzterProFzg.set(c.fahrzeugId, c.completedAt);
  }
  return fahrzeuge
    .map((f) => {
      const soll = allSoll.filter((s) => s.fahrzeugId === f.id);
      const faecher = new Set(soll.map((s) => s.fachLabel));
      // Soll je Artikel summieren (derselbe Artikel kann in mehreren Fächern liegen, teilt aber
      // EINEN Fahrzeugbestand), dann gegen den recorded Fahrzeugbestand vergleichen.
      const sollProArtikel = new Map<string, number>();
      for (const s of soll) sollProArtikel.set(s.artikelId, (sollProArtikel.get(s.artikelId) ?? 0) + s.soll);
      let artikelUnterSoll = 0;
      for (const [artikelId, sollSumme] of sollProArtikel) {
        const bu = allBu.filter((b) => b.artikelId === artikelId).map((b) => ({ lagerortId: b.lagerortId, menge: b.menge }));
        if (bestandProLagerort(bu, f.id) < sollSumme) artikelUnterSoll++;
      }
      return {
        id: f.id, name: f.name, kennung: f.kennung, aktiv: f.aktiv,
        positionen: soll.length, faecher: faecher.size, artikelUnterSoll,
        letzterCheck: letzterProFzg.get(f.id) ?? null,
        templateName: f.templateId ? (templateNamen.get(f.templateId) ?? null) : null,
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export type SollHerkunft = "manuell" | "vorlage" | "ueberschrieben";
export type SollZeile = {
  id: string; fachLabel: string; sort: number; artikelId: string; artikelName: string; einheit: string;
  handlagerFach: string; soll: number;
  fahrzeugBestand: number; // aktueller recorded Bestand AUF dem Fahrzeug (Ausgangspunkt des Abgleichs)
  handlagerBestand: number; // im Handlager verfügbar zum Nachfüllen
  herkunft: SollHerkunft; // aus Vorlage, manuell überschrieben oder individuell
  entfernt: boolean; // Grabstein: auf diesem Fahrzeug bewusst nicht vorhanden (zählt nicht als Soll)
};

// Liefert ALLE Soll-Zeilen inkl. Grabsteine (entfernt=true) mit Herkunfts-Flag. Anzeigen, die das
// echte Soll brauchen (Helfer-Check, Kennzahlen), filtern `entfernt` selbst heraus.
export function sollFuerFahrzeug(db: DB, fahrzeugId: string): SollZeile[] {
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const allBu = db.select().from(buchungen).all();
  const rows = db.select().from(sollPositionen).where(eq(sollPositionen.fahrzeugId, fahrzeugId)).all();
  return rows
    .map((p) => {
      const a = arts.get(p.artikelId);
      const bu = allBu.filter((x) => x.artikelId === p.artikelId).map((x) => ({ lagerortId: x.lagerortId, menge: x.menge }));
      const herkunft: SollHerkunft = !p.templatePositionId ? "manuell" : p.ueberschrieben ? "ueberschrieben" : "vorlage";
      return {
        id: p.id, fachLabel: p.fachLabel, sort: p.sort, artikelId: p.artikelId,
        artikelName: a?.name ?? "–", einheit: a?.einheit ?? "", handlagerFach: a?.fach ?? "", soll: p.soll,
        fahrzeugBestand: bestandProLagerort(bu, fahrzeugId),
        handlagerBestand: bestandProLagerort(bu, HANDLAGER_ID),
        herkunft, entfernt: p.entfernt,
      };
    })
    .sort((x, y) => x.fachLabel.localeCompare(y.fachLabel) || x.sort - y.sort);
}

export function checkHistorie(db: DB, limit = 50) {
  const namen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  return db.select().from(checks).orderBy(desc(checks.completedAt)).limit(limit).all().map((c) => {
    let positionen = 0, nachgefuelltGesamt = 0, korrigiertGesamt = 0, offenGesamt = 0;
    try {
      const raw = JSON.parse(c.ergebnis ?? "[]");
      if (Array.isArray(raw)) {
        // ALTES Format (vor Fahrzeugbestand): Array pro Position {fehlt, gebucht}.
        positionen = raw.length;
        nachgefuelltGesamt = raw.reduce((s: number, e: { gebucht?: number }) => s + (e.gebucht ?? 0), 0);
        offenGesamt = raw.reduce((s: number, e: { fehlt?: number; gebucht?: number }) => s + Math.max(0, (e.fehlt ?? 0) - (e.gebucht ?? 0)), 0);
      } else {
        // NEUES Format: {positionen:[…], artikel:[{korrektur, nachfuellGebucht}]}.
        positionen = (raw.positionen ?? []).length;
        nachgefuelltGesamt = (raw.artikel ?? []).reduce((s: number, a: { nachfuellGebucht?: number }) => s + (a.nachfuellGebucht ?? 0), 0);
        korrigiertGesamt = (raw.artikel ?? []).reduce((s: number, a: { korrektur?: number }) => s + Math.abs(a.korrektur ?? 0), 0);
        // Nach dem Check noch fehlend: Soll − gezählt − nachgefüllt (z. B. Handlager war leer).
        offenGesamt = (raw.artikel ?? []).reduce((s: number, a: { sollSumme?: number; istSumme?: number; nachfuellGebucht?: number }) => s + Math.max(0, (a.sollSumme ?? 0) - (a.istSumme ?? 0) - (a.nachfuellGebucht ?? 0)), 0);
      }
    } catch { /* ergebnis unlesbar → 0 */ }
    return { id: c.id, fahrzeugId: c.fahrzeugId, fahrzeugName: namen.get(c.fahrzeugId) ?? "–", completedAt: c.completedAt, positionen, nachgefuelltGesamt, korrigiertGesamt, offenGesamt };
  });
}

export type CheckPositionDetail = {
  fachLabel: string; artikelId: string; artikelName: string; einheit: string; soll: number; ist: number;
};
export type CheckArtikelDetail = {
  artikelId: string; artikelName: string; einheit: string;
  sollSumme: number; istSumme: number; recordedVorher: number; korrektur: number; nachfuellGebucht: number;
  offen: number; // nach dem Check noch fehlend: max(0, Soll − gezählt − nachgefüllt)
};
export type CheckDetail = {
  id: string; fahrzeugId: string; fahrzeugName: string; fahrzeugKennung: string | null;
  quelleId: string; startedAt: Date; completedAt: Date | null;
  positionen: CheckPositionDetail[]; artikel: CheckArtikelDetail[];
  altFormat: boolean; // altes ergebnis-Format ohne Positionsdetails
  summe: { positionen: number; nachgefuellt: number; korrigiert: number; offen: number };
};

// Detailansicht EINES abgeschlossenen Fahrzeug-Checks. Das ergebnis-JSON wird angereichert um
// Fach-/Artikelnamen (best effort — inzwischen gelöschte Soll-Positionen/Artikel werden tolerant
// überbrückt). Das ALTE ergebnis-Format (Array) trug keine Positionsdetails → altFormat=true.
export function checkDetail(db: DB, id: string): CheckDetail | null {
  const c = db.select().from(checks).where(eq(checks.id, id)).get();
  if (!c) return null;
  const fahrzeug = db.select().from(lagerorte).where(eq(lagerorte.id, c.fahrzeugId)).get();
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const sollRows = new Map(db.select().from(sollPositionen).all().map((s) => [s.id, s]));

  let positionen: CheckPositionDetail[] = [];
  let artikelD: CheckArtikelDetail[] = [];
  let altFormat = false;
  try {
    const raw = JSON.parse(c.ergebnis ?? "[]");
    if (Array.isArray(raw)) {
      altFormat = true; // altes Format (vor Fahrzeugbestand) ohne Soll/Ist je Position
    } else {
      positionen = (raw.positionen ?? []).map((p: { sollPositionId?: string; artikelId: string; soll?: number; ist?: number }) => {
        const a = arts.get(p.artikelId);
        const s = p.sollPositionId ? sollRows.get(p.sollPositionId) : undefined;
        return {
          fachLabel: s?.fachLabel ?? "–", artikelId: p.artikelId,
          artikelName: a?.name ?? "(gelöschter Artikel)", einheit: a?.einheit ?? "",
          soll: p.soll ?? 0, ist: p.ist ?? 0,
        };
      });
      artikelD = (raw.artikel ?? []).map((g: { artikelId: string; sollSumme?: number; istSumme?: number; recordedVorher?: number; korrektur?: number; nachfuellGebucht?: number }) => {
        const a = arts.get(g.artikelId);
        const sollSumme = g.sollSumme ?? 0, istSumme = g.istSumme ?? 0, nachfuellGebucht = g.nachfuellGebucht ?? 0;
        return {
          artikelId: g.artikelId, artikelName: a?.name ?? "(gelöschter Artikel)", einheit: a?.einheit ?? "",
          sollSumme, istSumme, recordedVorher: g.recordedVorher ?? 0,
          korrektur: g.korrektur ?? 0, nachfuellGebucht,
          offen: Math.max(0, sollSumme - istSumme - nachfuellGebucht),
        };
      });
    }
  } catch { /* ergebnis unlesbar → leere Detaillisten */ }

  positionen.sort((x, y) => x.fachLabel.localeCompare(y.fachLabel) || x.artikelName.localeCompare(y.artikelName));
  const nachgefuellt = artikelD.reduce((s, a) => s + a.nachfuellGebucht, 0);
  const korrigiert = artikelD.reduce((s, a) => s + Math.abs(a.korrektur), 0);
  const offen = artikelD.reduce((s, a) => s + a.offen, 0);

  return {
    id: c.id, fahrzeugId: c.fahrzeugId,
    fahrzeugName: fahrzeug?.name ?? "–", fahrzeugKennung: fahrzeug?.kennung ?? null,
    quelleId: c.quelleId, startedAt: c.startedAt, completedAt: c.completedAt,
    positionen, artikel: artikelD, altFormat,
    summe: { positionen: positionen.length, nachgefuellt, korrigiert, offen },
  };
}

export type BestellZeile = { id: string; name: string; einheit: string; fach: string; bestand: number; mindestbestand: number; vorschlag: number; bestellt: boolean };

export function bestellvorschlag(db: DB): BestellZeile[] {
  const allBu = db.select().from(buchungen).all();
  return db.select().from(artikel).where(eq(artikel.aktiv, true)).all()
    .map((a) => {
      // Bestellvorschlag basiert auf dem HANDLAGER-Bestand (Nachschub ins Zentrallager).
      const b = bestandProLagerort(allBu.filter((x) => x.artikelId === a.id).map((x) => ({ lagerortId: x.lagerortId, menge: x.menge })), HANDLAGER_ID);
      return { id: a.id, name: a.name, einheit: a.einheit, fach: a.fach, bestand: b, mindestbestand: a.mindestbestand, vorschlag: vorschlagsmenge(b, a.mindestbestand), bestellt: Boolean(a.bestelltAt) };
    })
    .filter((z) => braucht(z.bestand, z.mindestbestand));
}

export function tokenListe(db: DB) {
  const lagerNamen = new Map(db.select().from(lagerorte).all().map((l) => [l.id, l.name]));
  const artNamen = new Map(db.select().from(artikel).all().map((a) => [a.id, a.name]));
  return db
    .select()
    .from(tokens)
    .orderBy(desc(tokens.createdAt))
    .all()
    .map((t) => {
      const zielName =
        t.zielTyp === "fahrzeug" ? lagerNamen.get(t.zielId ?? "") ?? "?"
        : t.zielTyp === "artikel" ? artNamen.get(t.zielId ?? "") ?? "?"
        : null;
      return {
        id: t.id, code: t.code, label: t.label, aktiv: t.aktiv, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt,
        zielTyp: t.zielTyp, zielId: t.zielId, zielName,
      };
    });
}

// ── Fahrzeug-Vorlagen ───────────────────────────────────────────────────────

export type TemplateUebersichtZeile = {
  id: string; name: string; aktiv: boolean;
  positionen: number; faecher: number; fahrzeuge: number; // Anzahl verknüpfter Fahrzeuge
};

export function templateUebersicht(db: DB): TemplateUebersichtZeile[] {
  const templates = db.select().from(fahrzeugTemplates).all();
  const allPos = db.select().from(templatePositionen).all();
  const fahrzeuge = db.select().from(lagerorte).where(eq(lagerorte.typ, "fahrzeug")).all();
  return templates
    .map((t) => {
      const pos = allPos.filter((p) => p.templateId === t.id);
      return {
        id: t.id, name: t.name, aktiv: t.aktiv,
        positionen: pos.length,
        faecher: new Set(pos.map((p) => p.fachLabel)).size,
        fahrzeuge: fahrzeuge.filter((f) => f.templateId === t.id).length,
      };
    })
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
}

export type TemplatePositionZeile = {
  id: string; fachLabel: string; sort: number; artikelId: string; artikelName: string; einheit: string;
  handlagerFach: string; soll: number;
};
export type TemplateDetail = {
  id: string; name: string; aktiv: boolean;
  positionen: TemplatePositionZeile[];
  fahrzeuge: { id: string; name: string; kennung: string | null; aktiv: boolean }[];
};

export function templateDetail(db: DB, id: string): TemplateDetail | null {
  const t = db.select().from(fahrzeugTemplates).where(eq(fahrzeugTemplates.id, id)).get();
  if (!t) return null;
  const arts = new Map(db.select().from(artikel).all().map((a) => [a.id, a]));
  const positionen = db.select().from(templatePositionen).where(eq(templatePositionen.templateId, id)).all()
    .map((p) => {
      const a = arts.get(p.artikelId);
      return {
        id: p.id, fachLabel: p.fachLabel, sort: p.sort, artikelId: p.artikelId,
        artikelName: a?.name ?? "–", einheit: a?.einheit ?? "", handlagerFach: a?.fach ?? "", soll: p.soll,
      };
    })
    .sort((x, y) => x.fachLabel.localeCompare(y.fachLabel) || x.sort - y.sort);
  const fahrzeuge = db.select().from(lagerorte).where(eq(lagerorte.templateId, id)).all()
    .map((f) => ({ id: f.id, name: f.name, kennung: f.kennung, aktiv: f.aktiv }))
    .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || a.name.localeCompare(b.name));
  return { id: t.id, name: t.name, aktiv: t.aktiv, positionen, fahrzeuge };
}

export function templateListeAktiv(db: DB) {
  return db.select().from(fahrzeugTemplates).where(eq(fahrzeugTemplates.aktiv, true)).all()
    .map((t) => ({ id: t.id, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
