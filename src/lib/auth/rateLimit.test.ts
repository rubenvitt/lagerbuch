import { beforeEach, describe, expect, it } from "vitest";
import { consumeRate, clientIp, _resetRateLimit } from "./rateLimit";

beforeEach(() => _resetRateLimit());

describe("consumeRate", () => {
  it("erlaubt 5, blockt den 6. innerhalb der Minute", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(consumeRate("ip", t).ok).toBe(true);
    const sixth = consumeRate("ip", t);
    expect(sixth.ok).toBe(false);
    expect(sixth.retryAfter).toBeGreaterThan(0);
  });
  it("füllt über Zeit wieder auf", () => {
    const t = 2_000_000;
    for (let i = 0; i < 5; i++) consumeRate("ip", t);
    expect(consumeRate("ip", t).ok).toBe(false);
    expect(consumeRate("ip", t + 60_000).ok).toBe(true); // nach 60 s wieder voll
  });
  it("isoliert pro Key", () => {
    const t = 3_000_000;
    for (let i = 0; i < 5; i++) consumeRate("a", t);
    expect(consumeRate("a", t).ok).toBe(false);
    expect(consumeRate("b", t).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("nimmt den ersten XFF-Hop", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientIp(h, "fb")).toBe("203.0.113.7");
  });
  it("fällt ohne XFF auf fallback zurück", () => {
    expect(clientIp(new Headers(), "fb")).toBe("fb");
  });
});
