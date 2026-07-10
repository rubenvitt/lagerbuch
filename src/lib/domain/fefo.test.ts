import { describe, expect, it } from "vitest";
import { fefoVerteilung } from "./fefo";

describe("fefoVerteilung", () => {
  it("takes from the earliest-expiring charge first", () => {
    const r = fefoVerteilung(
      [
        { chargeId: "late", verfall: "2028-01", rest: 10 },
        { chargeId: "early", verfall: "2026-08", rest: 10 },
      ],
      4,
    );
    expect(r).toEqual([{ chargeId: "early", menge: 4 }]);
  });
  it("splits across chargen when one is not enough", () => {
    const r = fefoVerteilung(
      [
        { chargeId: "a", verfall: "2026-08", rest: 3 },
        { chargeId: "b", verfall: "2027-01", rest: 10 },
      ],
      5,
    );
    expect(r).toEqual([
      { chargeId: "a", menge: 3 },
      { chargeId: "b", menge: 2 },
    ]);
  });
  it("caps at total available rest", () => {
    const r = fefoVerteilung([{ chargeId: "a", verfall: "2026-08", rest: 3 }], 99);
    expect(r).toEqual([{ chargeId: "a", menge: 3 }]);
  });
  it("skips empty chargen and omits zero contributions", () => {
    const r = fefoVerteilung(
      [
        { chargeId: "empty", verfall: "2026-01", rest: 0 },
        { chargeId: "a", verfall: "2026-08", rest: 5 },
      ],
      2,
    );
    expect(r).toEqual([{ chargeId: "a", menge: 2 }]);
  });
  it("returns [] when menge is 0 or no rest exists", () => {
    expect(fefoVerteilung([{ chargeId: "a", verfall: "2026-08", rest: 5 }], 0)).toEqual([]);
    expect(fefoVerteilung([], 5)).toEqual([]);
  });
});
