import { describe, expect, test } from "bun:test";
import { redactJson, redactString } from "../redact";

describe("redaction", () => {
  test("GitHub installation tokens (variable-length stateless format)", () => {
    expect(redactString("token ghs_1234567890_ABCDEFghijkl")).toBe("token [REDACTED]");
    expect(redactString("Authorization: Bearer ghs_599999_eyJhbGciOiJIUzI1NiJ9.x")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
  });

  test("all GitHub token families", () => {
    for (const t of ["gho_x123", "ghu_x123", "ghr_x123", "ghp_x123", "github_pat_11ABC_def"]) {
      expect(redactString(`ok ${t} ok`)).toBe("ok [REDACTED] ok");
    }
  });

  test("other providers", () => {
    expect(redactString("sbp_0123456789abcdef0123456789abcdef01234567")).toBe("[REDACTED]");
    expect(redactString("whsec_+abc/def=ghi")).toBe("[REDACTED]");
    expect(redactString("cfat_8xAbC123")).toBe("[REDACTED]");
    expect(redactString("polar_sc_abc123")).toBe("[REDACTED]");
  });

  test("JWTs", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redactString(`Bearer ${jwt}`)).toBe("Bearer [REDACTED]");
  });

  test("PEM bodies", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA7\n-----END RSA PRIVATE KEY-----";
    expect(redactString(`got key: ${pem}`)).toBe("got key: [REDACTED]");
  });

  test("deep JSON redaction with sensitive keys", () => {
    const out = redactJson({
      target: { repo: "a/b", token: "ghs_shouldneverbehere" },
      nested: [{ api_key: "abc", name: "fine" }],
      note: "contains ghr_leak123 inside",
      count: 3,
    });
    expect(out.target.repo).toBe("a/b");
    expect(out.target.token).toBe("[REDACTED]");
    expect(out.nested[0].api_key).toBe("[REDACTED]");
    expect(out.nested[0].name).toBe("fine");
    expect(out.note).toBe("contains [REDACTED] inside");
    expect(out.count).toBe(3);
  });

  test("plain text survives", () => {
    expect(redactString("repos/octocat/site contents index.html")).toBe("repos/octocat/site contents index.html");
  });
});
