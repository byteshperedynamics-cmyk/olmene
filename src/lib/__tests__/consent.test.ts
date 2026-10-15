import { describe, expect, test } from "bun:test";
import { analyticsLocation } from "../consent";

describe("what analytics sees of the address", () => {
  test("invitation and unsubscribe tokens are stripped, everything else kept", () => {
    expect(analyticsLocation("https://olmene.com/invite/?t=abc_DEF-123")).toBe("https://olmene.com/invite/");
    expect(analyticsLocation("https://olmene.com/unsubscribe/?t=" + "a".repeat(64))).toBe("https://olmene.com/unsubscribe/");
    expect(analyticsLocation("https://olmene.com/pricing/?interval=year&t=x#plans")).toBe("https://olmene.com/pricing/?interval=year#plans");
    expect(analyticsLocation("https://olmene.com/")).toBe("https://olmene.com/");
  });
});
