import { describe, expect, test } from "bun:test";
import { diffLines, unifiedDiff } from "../diff";

describe("diff", () => {
  test("identical content produces no diff", () => {
    expect(unifiedDiff("f.txt", "a\nb", "a\nb")).toBe("");
    expect(diffLines("a", "a")).toEqual([{ type: " ", text: "a" }]);
  });

  test("single-line change", () => {
    const lines = diffLines("one\ntwo\nthree", "one\nTWO\nthree");
    expect(lines).toEqual([
      { type: " ", text: "one" },
      { type: "-", text: "two" },
      { type: "+", text: "TWO" },
      { type: " ", text: "three" },
    ]);
  });

  test("insertion and deletion", () => {
    expect(diffLines("a\nc", "a\nb\nc")).toEqual([
      { type: " ", text: "a" },
      { type: "+", text: "b" },
      { type: " ", text: "c" },
    ]);
    expect(diffLines("a\nb\nc", "a\nc")).toEqual([
      { type: " ", text: "a" },
      { type: "-", text: "b" },
      { type: " ", text: "c" },
    ]);
  });

  test("unified diff contains headers and hunks", () => {
    const before = "<head>\n  <title>Old</title>\n</head>";
    const after = "<head>\n  <title>New</title>\n</head>";
    const d = unifiedDiff("index.html", before, after);
    expect(d).toContain("--- a/index.html");
    expect(d).toContain("+++ b/index.html");
    expect(d).toContain("-  <title>Old</title>");
    expect(d).toContain("+  <title>New</title>");
    expect(d).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
  });
});
