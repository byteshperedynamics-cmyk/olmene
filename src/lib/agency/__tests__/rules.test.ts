import { describe, expect, test } from "bun:test";
import { TeamError } from "@/lib/workspace/roles";
import {
  canWhiteLabel,
  cleanBrandInput,
  cleanClientInput,
  cleanRecipientEmail,
  isPortalSlug,
  newPortalSlug,
  nextReportAt,
  normalizeWebsite,
  portalPath,
  sniffImage,
} from "../rules";

function refused(fn: () => unknown): TeamError {
  try {
    fn();
  } catch (e) {
    if (e instanceof TeamError) return e;
    throw e;
  }
  throw new Error("expected a TeamError");
}

describe("white label", () => {
  test("comes with Team (and a future Agency plan), monthly or yearly", () => {
    expect(canWhiteLabel("team")).toBe(true);
    expect(canWhiteLabel("team-yearly")).toBe(true);
    expect(canWhiteLabel("agency")).toBe(true);
    expect(canWhiteLabel("agency-yearly")).toBe(true);
    expect(canWhiteLabel("fix")).toBe(false);
    expect(canWhiteLabel("teams")).toBe(false);
    expect(canWhiteLabel(null)).toBe(false);
    expect(canWhiteLabel(undefined)).toBe(false);
  });
});

describe("client page ids", () => {
  test("12 characters from an alphabet without look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const s = newPortalSlug();
      expect(isPortalSlug(s)).toBe(true);
      expect(s).not.toMatch(/[l01]/);
    }
  });

  test("uses the random source it's given", () => {
    expect(newPortalSlug((n) => new Uint8Array(n))).toBe("aaaaaaaaaaaa");
    expect(newPortalSlug((n) => new Uint8Array(n).fill(32))).toBe("999999999999");
  });

  test("anything else isn't a page id", () => {
    for (const bad of ["", "abc", "ABCDEFGHJKMN", "abcdefghjk2", "abcdefghjk234", "abcdefghjk2/", null, 12]) {
      expect(isPortalSlug(bad)).toBe(false);
    }
    expect(portalPath("abcdefghjk23")).toBe("/c/abcdefghjk23/");
  });
});

describe("website addresses", () => {
  test("what people type becomes a full address", () => {
    expect(normalizeWebsite("bakery.example")).toBe("https://bakery.example/");
    expect(normalizeWebsite("  http://bakery.example/shop ")).toBe("http://bakery.example/shop");
    expect(normalizeWebsite("HTTPS://Bakery.Example")).toBe("https://bakery.example/");
    expect(normalizeWebsite("bäckerei.example")).toBe("https://xn--bckerei-5wa.example/");
  });

  test("not addresses, other schemes and credentials are refused", () => {
    for (const bad of ["", "bakery", "javascript:alert(1)", "ftp://bakery.example", "https://user:pw@bakery.example", "bakery .example", "https://", "https://-/"]) {
      expect(normalizeWebsite(bad)).toBeNull();
    }
    expect(normalizeWebsite(`https://${"a".repeat(300)}.example`)).toBeNull();
  });

  test("https only when asked", () => {
    expect(normalizeWebsite("http://studio.example", { httpsOnly: true })).toBeNull();
    expect(normalizeWebsite("studio.example", { httpsOnly: true })).toBe("https://studio.example/");
  });
});

describe("client form", () => {
  test("a name is needed when adding", () => {
    expect(refused(() => cleanClientInput({}, true)).code).toBe("bad_name");
    expect(refused(() => cleanClientInput({ name: "   " }, true)).code).toBe("bad_name");
    expect(refused(() => cleanClientInput({ name: "x".repeat(81) }, true)).code).toBe("bad_name");
    expect(cleanClientInput({ name: "  Bakery   Co " }, true)).toEqual({ name: "Bakery Co" });
  });

  test("editing changes only what was sent", () => {
    expect(cleanClientInput({ website: "bakery.example" }, false)).toEqual({ website: "https://bakery.example/" });
    expect(cleanClientInput({ contactEmail: " Owner@Bakery.Example " }, false)).toEqual({ contactEmail: "owner@bakery.example" });
    expect(cleanClientInput({ website: "", contactEmail: null }, false)).toEqual({ website: null, contactEmail: null });
  });

  test("bad website or email is refused with a message", () => {
    const w = refused(() => cleanClientInput({ name: "A", website: "not a site" }, true));
    expect(w.status).toBe(400);
    expect(w.code).toBe("bad_website");
    expect(refused(() => cleanClientInput({ contactEmail: "owner@" }, false)).code).toBe("bad_email");
  });
});

describe("branding form", () => {
  test("cleans name, colour and website", () => {
    expect(cleanBrandInput({ name: " Northwind  Studio ", color: "#1F6FEB", url: "northwind.example" })).toEqual({
      name: "Northwind Studio",
      color: "#1f6feb",
      url: "https://northwind.example/",
    });
  });

  test("empty clears", () => {
    expect(cleanBrandInput({ name: "", color: "", url: "" })).toEqual({ name: null, color: null, url: null });
  });

  test("refuses what client pages can't show safely", () => {
    expect(refused(() => cleanBrandInput({ color: "red" })).code).toBe("bad_color");
    expect(refused(() => cleanBrandInput({ color: "#12345" })).code).toBe("bad_color");
    expect(refused(() => cleanBrandInput({ url: "http://northwind.example" })).code).toBe("bad_url");
    expect(refused(() => cleanBrandInput({ url: "javascript:alert(1)" })).code).toBe("bad_url");
    expect(refused(() => cleanBrandInput({ name: "n".repeat(81) })).code).toBe("bad_name");
    expect(refused(() => cleanBrandInput({ whiteLabel: "yes" })).code).toBe("bad_request");
    expect(cleanBrandInput({ whiteLabel: false })).toEqual({ whiteLabel: false });
  });
});

describe("logo files", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  test("known by their first bytes", () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
    expect(sniffImage(webp)).toBe("image/webp");
  });

  test("SVG, GIF and anything else are refused", () => {
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("GIF89a.............."))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
    // A PNG signature cut short isn't a PNG.
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b, 0, 0]))).toBeNull();
  });
});

describe("client reports", () => {
  // The same cases are in supabase/functions/_shared/client-report.test.ts: the Worker sets the first slot, the monitor the ones after.
  const SCHEDULE: Array<["weekly" | "monthly", string, string]> = [
    ["weekly", "2026-10-15T12:00:00Z", "2026-10-19T08:00:00.000Z"], // Thursday → Monday
    ["weekly", "2026-10-19T07:59:00Z", "2026-10-19T08:00:00.000Z"], // Monday before eight → that morning
    ["weekly", "2026-10-19T08:00:00Z", "2026-10-26T08:00:00.000Z"], // Monday at eight → next week
    ["weekly", "2026-10-18T23:00:00Z", "2026-10-19T08:00:00.000Z"], // Sunday night → Monday
    ["monthly", "2026-10-15T12:00:00Z", "2026-11-01T08:00:00.000Z"],
    ["monthly", "2026-11-01T07:00:00Z", "2026-11-01T08:00:00.000Z"],
    ["monthly", "2026-11-01T08:00:00Z", "2026-12-01T08:00:00.000Z"],
    ["monthly", "2026-12-20T00:00:00Z", "2027-01-01T08:00:00.000Z"],
  ];

  test("go out Mondays or the 1st at 08:00 UTC, always after now; none when off", () => {
    for (const [cadence, from, want] of SCHEDULE) expect(nextReportAt(cadence, new Date(from))?.toISOString()).toBe(want);
    expect(nextReportAt("off", new Date())).toBeNull();
  });

  test("the cadence is off, weekly or monthly", () => {
    expect(cleanClientInput({ reportCadence: "weekly" }, false)).toEqual({ reportCadence: "weekly" });
    expect(cleanClientInput({ reportCadence: "off" }, false)).toEqual({ reportCadence: "off" });
    expect(cleanClientInput({ name: "Bakery" }, false)).toEqual({ name: "Bakery" });
    expect(refused(() => cleanClientInput({ reportCadence: "daily" }, false)).code).toBe("bad_cadence");
    expect(refused(() => cleanClientInput({ reportCadence: null }, false)).code).toBe("bad_cadence");
  });

  test("recipient addresses are trimmed and lower-cased, and must look like one", () => {
    expect(cleanRecipientEmail("  Owner@Bakery.Example ")).toBe("owner@bakery.example");
    for (const bad of ["", "owner", "owner@bakery", "a b@c.de", `${"x".repeat(250)}@c.de`, 42, null]) {
      expect(refused(() => cleanRecipientEmail(bad)).code).toBe("bad_email");
    }
  });
});
