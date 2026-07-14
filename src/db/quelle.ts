import type { DB } from "@/db";
import { tokens, users } from "@/db/schema";

/**
 * Löst quelleTyp/quelleId aus den append-only-Logs in einen Anzeigenamen auf.
 * In der DB bleibt die rohe ID stehen (nachweisfest); nur die Anzeige wird aufgelöst:
 * oidc → users.name (Vor-/Nachname aus dem OIDC-Login), sonst E-Mail, sonst rohe ID;
 * token → Token-Label (der Code allein sagt niemandem etwas); system → "System".
 * Ein Aufruf lädt beide Lookup-Tabellen einmal — den Resolver pro Request bauen und
 * über alle Zeilen wiederverwenden.
 */
export function quelleAufloeser(db: DB): (quelleTyp: string, quelleId: string) => string {
  const userNamen = new Map(
    db
      .select()
      .from(users)
      .all()
      .map((u) => [u.id, u.name?.trim() || u.email?.trim() || u.id]),
  );
  const tokenLabels = new Map(db.select().from(tokens).all().map((t) => [t.code, t.label]));
  return (quelleTyp, quelleId) => {
    if (quelleTyp === "system") return "System";
    if (quelleTyp === "token") return tokenLabels.get(quelleId) ?? quelleId;
    return userNamen.get(quelleId) ?? quelleId;
  };
}
