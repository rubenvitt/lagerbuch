// In-Memory-Rate-Limit (Token-Bucket). Prozesslokal — resettet bei Neustart;
// für Single-Process-`standalone` ausreichend (Codes sind physisch laminiert,
// niedrige Rechte, sofort sperrbar). Kein Redis.
const CAPACITY = 5;
const WINDOW_MS = 60_000;
const REFILL_PER_MS = CAPACITY / WINDOW_MS;

type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();

export function consumeRate(key: string, now: number = Date.now()): { ok: boolean; retryAfter: number } {
  const b = buckets.get(key) ?? { tokens: CAPACITY, last: now };
  const refilled = Math.min(CAPACITY, b.tokens + (now - b.last) * REFILL_PER_MS);
  if (refilled >= 1) {
    buckets.set(key, { tokens: refilled - 1, last: now });
    return { ok: true, retryAfter: 0 };
  }
  buckets.set(key, { tokens: refilled, last: now });
  const retryAfter = Math.ceil((1 - refilled) / REFILL_PER_MS / 1000);
  return { ok: false, retryAfter };
}

// Nimmt den RECHTESTEN X-Forwarded-For-Eintrag, nicht den linkesten:
// Annahme laut deployment.md ist genau EIN vertrauenswürdiger Reverse-Proxy,
// der die echte Peer-IP als letzten Eintrag anhängt (nginx
// `$proxy_add_x_forwarded_for`, Caddy-Default). Der linkeste Eintrag ist vom
// Client frei setzbar; ihn zu vertrauen würde das Per-IP-Rate-Limit durch
// XFF-Spoofing aushebeln (CWE-348).
export function clientIp(headers: Headers, fallback: string): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const last = xff.split(",").at(-1)?.trim();
    if (last) return last;
  }
  return fallback;
}

export function _resetRateLimit(): void {
  buckets.clear();
}
