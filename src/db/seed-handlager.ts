import type { DB } from "@/db";
import { lagerorte } from "@/db/schema";

export const HANDLAGER_ID = "handlager";

export function ensureHandlager(db: DB): void {
  db.insert(lagerorte)
    .values({ id: HANDLAGER_ID, name: "Handlager", typ: "lager", aktiv: true })
    .onConflictDoNothing()
    .run();
}
