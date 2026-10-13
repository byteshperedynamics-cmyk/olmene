//   deno test --allow-all supabase/functions/health-watch/rollback.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { rollbackTarget } from "./rollback.ts";

const d = (id: string, created: string, version: string) => ({ id, created_on: created, versions: [{ version_id: version, percentage: 100 }] });

Deno.test("rollback: restore the previous different version of a fresh deploy", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const deps = [d("3", "2026-10-20T11:00:00Z", "v3"), d("2", "2026-10-19T09:00:00Z", "v2"), d("1", "2026-10-18T09:00:00Z", "v1")];
  assertEquals(rollbackTarget(deps, now).versionId, "v2");
});

Deno.test("rollback: never for an old deployment, skip same-version redeploys", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  assertEquals(rollbackTarget([d("2", "2026-10-20T06:00:00Z", "v2"), d("1", "2026-10-19T06:00:00Z", "v1")], now).versionId, null);
  // A gated deploy's 0% → 100% steps share the top version: look past them.
  const gated = [d("4", "2026-10-20T11:50:00Z", "v3"), { id: "3", created_on: "2026-10-20T11:49:00Z", versions: [{ version_id: "v2", percentage: 100 }, { version_id: "v3", percentage: 0 }] }, d("2", "2026-10-19T09:00:00Z", "v2")];
  assertEquals(rollbackTarget(gated, now).versionId, "v2");
});
