import { describe, expect, it } from "vitest";
import { createTestDb } from "@/db/testing";
import { tokens, users, newId } from "@/db/schema";
import { quelleAufloeser } from "./quelle";

function seed() {
  const db = createTestDb();
  db.insert(users).values({ id: "sub-uuid-1", name: "Erika Musterfrau", email: "erika@example.org" }).run();
  db.insert(users).values({ id: "sub-uuid-2", name: null, email: "max@example.org" }).run();
  db.insert(users).values({ id: "sub-uuid-3", name: "  ", email: null }).run();
  db.insert(tokens)
    .values({ id: newId(), code: "831-042", label: "RTW 1", aktiv: true, createdAt: new Date(), createdBy: "sub-uuid-1" })
    .run();
  return db;
}

describe("quelleAufloeser", () => {
  it("oidc → Name, sonst E-Mail, sonst rohe ID", () => {
    const wer = quelleAufloeser(seed());
    expect(wer("oidc", "sub-uuid-1")).toBe("Erika Musterfrau");
    expect(wer("oidc", "sub-uuid-2")).toBe("max@example.org");
    expect(wer("oidc", "sub-uuid-3")).toBe("sub-uuid-3"); // Leerraum-Name zählt nicht
    expect(wer("oidc", "unbekannt")).toBe("unbekannt");
  });
  it("token → Label, unbekannter Code bleibt roh", () => {
    const wer = quelleAufloeser(seed());
    expect(wer("token", "831-042")).toBe("RTW 1");
    expect(wer("token", "000-000")).toBe("000-000");
  });
  it("system → System", () => {
    expect(quelleAufloeser(seed())("system", "seed")).toBe("System");
  });
});
