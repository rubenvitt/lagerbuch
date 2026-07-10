import { expect, it } from "vitest";
import { GET } from "./route";

it("manifest reflects config and sets the manifest content type", async () => {
  const res = GET();
  expect(res.headers.get("Content-Type")).toBe("application/manifest+json");
  const body = await res.json();
  expect(body.short_name).toBe("Lagerbuch");
  expect(body.display).toBe("standalone");
  // APP_ORG defaults to "" in the test env → name is just the app name
  expect(body.name).toBe("Lagerbuch");
});
