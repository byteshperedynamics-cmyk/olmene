/**
 * Minimal unified-diff generator (no dependencies — keeps the Worker bundle
 * light). Classic LCS line diff; good enough for review-sized HTML files and
 * exactly deterministic for tests.
 */

export interface DiffLine {
  type: " " | "-" | "+";
  text: string;
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  // LCS table (files here are small; cap defensively)
  if (n * m > 4_000_000) {
    return [
      ...a.map((text) => ({ type: "-" as const, text })),
      ...b.map((text) => ({ type: "+" as const, text })),
    ];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: " ", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "-", text: a[i] });
      i++;
    } else {
      out.push({ type: "+", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "-", text: a[i++] });
  while (j < m) out.push({ type: "+", text: b[j++] });
  return out;
}

/** Unified-diff text with @@ hunks (3 lines of context). */
export function unifiedDiff(path: string, before: string, after: string): string {
  const lines = diffLines(before, after);
  if (lines.every((l) => l.type === " ")) return "";

  const out: string[] = [`--- a/${path}`, `+++ b/${path}`];
  let idx = 0;
  while (idx < lines.length) {
    if (lines[idx].type === " ") {
      idx++;
      continue;
    }
    // Hunk start: back up 3 context lines
    const start = Math.max(0, idx - 3);
    // Find hunk end: next run of >= 6 context lines or EOF
    let end = idx;
    let ctx = 0;
    while (end < lines.length) {
      if (lines[end].type === " ") {
        ctx++;
        if (ctx > 6) break;
      } else {
        ctx = 0;
      }
      end++;
    }
    const hunkEnd = Math.min(lines.length, end - (ctx > 6 ? 3 : 0));
    const hunk = lines.slice(start, hunkEnd);
    const removed = hunk.filter((l) => l.type === "-").length;
    const added = hunk.filter((l) => l.type === "+").length;
    const aStart = countBefore(lines, start) + 1;
    const bStart = countAfter(lines, start) + 1;
    out.push(`@@ -${aStart},${removed + countContext(hunk, "-")} +${bStart},${added + countContext(hunk, "+")} @@`);
    for (const l of hunk) out.push(`${l.type}${l.text}`);
    idx = hunkEnd;
  }
  return out.join("\n");
}

function countBefore(lines: DiffLine[], pos: number): number {
  let c = 0;
  for (let k = 0; k < pos; k++) if (lines[k].type !== "+") c++;
  return c;
}
function countAfter(lines: DiffLine[], pos: number): number {
  let c = 0;
  for (let k = 0; k < pos; k++) if (lines[k].type !== "-") c++;
  return c;
}
function countContext(hunk: DiffLine[], type: "-" | "+"): number {
  return hunk.filter((l) => l.type === " " || l.type === type).length - hunk.filter((l) => l.type === type).length;
}
