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
