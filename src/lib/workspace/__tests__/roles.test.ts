import { describe, expect, test } from "bun:test";
import {
  atLeast,
  defaultWorkspaceName,
  isInvitableRole,
  isRole,
  normalizeEmail,
  roleRequiredMessage,
  seatLimit,
} from "../roles";
import { isInviteToken, newInviteToken, sha256Hex } from "../server";

describe("roles", () => {
  test("owner > admin > member > viewer", () => {
    expect(atLeast("owner", "admin")).toBe(true);
    expect(atLeast("admin", "admin")).toBe(true);
    expect(atLeast("member", "admin")).toBe(false);
    expect(atLeast("member", "member")).toBe(true);
    expect(atLeast("viewer", "member")).toBe(false);
    expect(atLeast("viewer", "viewer")).toBe(true);
    expect(atLeast(null, "viewer")).toBe(false);
  });

  test("only admin, member and viewer can be given by invitation", () => {
    expect(isInvitableRole("admin")).toBe(true);
    expect(isInvitableRole("owner")).toBe(false);
    expect(isInvitableRole("superuser")).toBe(false);
    expect(isRole("owner")).toBe(true);
  });

  test("refusals say what to do", () => {
    expect(roleRequiredMessage("member")).toContain("Ask an admin");
    expect(roleRequiredMessage("owner")).toContain("owner");
  });
});

describe("seats", () => {
  test("each plan includes a number of people; no plan is just the owner", () => {
    expect(seatLimit(null)).toBe(1);
    expect(seatLimit("single-report-29")).toBe(1);
    expect(seatLimit("fix")).toBe(2);
    expect(seatLimit("fix-yearly")).toBe(2);
    expect(seatLimit("team")).toBe(5);
    expect(seatLimit("team-yearly")).toBe(5);
  });
});

describe("names and emails", () => {
  test("a workspace is named after its owner, or their company domain", () => {
    expect(defaultWorkspaceName("Ada Lovelace", "ada@example.com")).toBe("Ada's workspace");
    expect(defaultWorkspaceName(null, "ana@acme-studio.com")).toBe("Acme-studio");
    expect(defaultWorkspaceName(null, "someone@gmail.com")).toBe("My workspace");
    expect(defaultWorkspaceName("  ", null)).toBe("My workspace");
  });

  test("emails are trimmed, lower-cased and checked", () => {
    expect(normalizeEmail("  Ben@Acme.Example ")).toBe("ben@acme.example");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });
});

describe("invitation tokens", () => {
  test("random, URL-safe, and only their hash is stored", async () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).not.toBe(b);
    expect(isInviteToken(a)).toBe(true);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(isInviteToken("short")).toBe(false);
    expect(isInviteToken("x".repeat(43) + "/")).toBe(false);
  });
});
