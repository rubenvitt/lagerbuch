import { describe, expect, it } from "vitest";
import { backupDateiname, veralteteBackups } from "./backup";

describe("backup pure", () => {
  it("backupDateiname mit Nullpad", () => {
    expect(backupDateiname(new Date(2026, 6, 3))).toBe("lagerbuch-20260703.db");
    expect(backupDateiname(new Date(2026, 11, 25))).toBe("lagerbuch-20261225.db");
  });
  it("veralteteBackups selektiert > retention alte, ignoriert Fremdnamen", () => {
    const now = new Date(2026, 6, 20);
    const dateien = ["lagerbuch-20260701.db", "lagerbuch-20260718.db", "andere.db", "lagerbuch-xxxx.db"];
    expect(veralteteBackups(dateien, now, 14)).toEqual(["lagerbuch-20260701.db"]);
  });
});
