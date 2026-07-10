import { expect, it } from "vitest";
import { GET } from "./route";

it("health responds 200 with status ok", async () => {
  const res = GET();
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ status: "ok" });
});
