import { afterEach, describe, expect, test } from "bun:test";
import { agentAdminEmails, isAgentAdmin } from "../env";

const ORIGINAL = process.env.AGENT_ADMIN_EMAILS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AGENT_ADMIN_EMAILS;
  else process.env.AGENT_ADMIN_EMAILS = ORIGINAL;
});

describe("GitHub App registration allow-list", () => {
  test("fails closed when AGENT_ADMIN_EMAILS is unset or empty", () => {
    delete process.env.AGENT_ADMIN_EMAILS;
    expect(isAgentAdmin("owner@example.com")).toBe(false);
    process.env.AGENT_ADMIN_EMAILS = "  ,  ";
    expect(agentAdminEmails()).toEqual([]);
    expect(isAgentAdmin("owner@example.com")).toBe(false);
  });

  test("matches listed emails case-insensitively and ignores spacing", () => {
    process.env.AGENT_ADMIN_EMAILS = " Owner@Example.com , second@example.com";
    expect(isAgentAdmin("owner@example.com")).toBe(true);
    expect(isAgentAdmin("SECOND@example.com ")).toBe(true);
  });

  test("rejects everyone else, including missing emails", () => {
    process.env.AGENT_ADMIN_EMAILS = "owner@example.com";
    expect(isAgentAdmin("attacker@example.com")).toBe(false);
    expect(isAgentAdmin("owner@example.com.evil.io")).toBe(false);
    expect(isAgentAdmin(null)).toBe(false);
    expect(isAgentAdmin(undefined)).toBe(false);
  });
});
