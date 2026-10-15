import { describe, expect, test } from "bun:test";
import { safeNextPath } from "../safe-next";

describe("safeNextPath", () => {
  test("keeps in-app paths, query and hash", () => {
    expect(safeNextPath("/app/")).toBe("/app/");
    expect(safeNextPath("/app/checkout/?plan=pro")).toBe("/app/checkout/?plan=pro");
    expect(safeNextPath("/app/account/#progress")).toBe("/app/account/#progress");
    expect(safeNextPath("/app/report/abc/?tab=fixes&x=%2F%2Fevil")).toBe("/app/report/abc/?tab=fixes&x=%2F%2Fevil");
  });

  test("falls back when there's nothing usable", () => {
    expect(safeNextPath(null)).toBe("/app/");
    expect(safeNextPath(undefined)).toBe("/app/");
    expect(safeNextPath("")).toBe("/app/");
    expect(safeNextPath("app/")).toBe("/app/");
    expect(safeNextPath("/" + "a".repeat(600))).toBe("/app/");
    expect(safeNextPath(null, "/")).toBe("/");
  });

  test("never leaves the site", () => {
    const attacks = [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example",
      "/\\/evil.example",
      "/\t/evil.example", // ?next=/%09/evil.example: browsers drop the tab
      "/\n/evil.example",
      "/\r\n/evil.example",
      "/ /evil.example",
      "/\u0000/evil.example",
      "javascript:alert(1)",
      "/%2F%2Fevil.example", // stays a path on this site, so it may pass, but must not change origin
    ];
    for (const a of attacks) {
      const out = safeNextPath(a);
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
      expect(new URL(out, "https://olmene.com").origin).toBe("https://olmene.com");
    }
    expect(safeNextPath("/\t/evil.example")).toBe("/app/");
    expect(safeNextPath("/\\evil.example")).toBe("/app/");
  });

  test("what the auth gate builds round-trips unchanged", () => {
    // app/layout.tsx: encodeURIComponent(pathname + search), then URLSearchParams decodes it once.
    const here = "/app/report/8f3c/?tab=fixes";
    const decoded = new URLSearchParams(`next=${encodeURIComponent(here)}`).get("next");
    expect(safeNextPath(decoded)).toBe(here);
  });
});
