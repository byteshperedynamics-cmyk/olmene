"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Row {
  kind: "ctx" | "add" | "del" | "hunk";
  oldNo?: number;
  newNo?: number;
  text: string;
}

/** Parse a unified diff (as produced by src/lib/agent/diff.ts) into rows. */
export function parseUnifiedDiff(diff: string): Row[] {
  const rows: Row[] = [];
  let o = 0;
  let n = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;
    const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (h) {
      o = Number(h[1]);
      n = Number(h[2]);
      rows.push({ kind: "hunk", text: line });
      continue;
    }
    if (line.startsWith("+")) rows.push({ kind: "add", newNo: n++, text: line.slice(1) });
    else if (line.startsWith("-")) rows.push({ kind: "del", oldNo: o++, text: line.slice(1) });
    else if (line.startsWith(" ") || line === "") {
      if (line === "" && rows.length === 0) continue;
      rows.push({ kind: "ctx", oldNo: o++, newNo: n++, text: line.slice(1) });
    } else if (line.startsWith("\\")) continue;
    else rows.push({ kind: "ctx", text: line });
  }
  // drop a trailing empty context row produced by a final newline
  while (rows.length && rows[rows.length - 1].kind === "ctx" && rows[rows.length - 1].text === "" && rows[rows.length - 1].oldNo === undefined) rows.pop();
  return rows;
}

export interface DiffFile {
  path: string;
  diff: string;
  isNewFile?: boolean;
}

/**
 * DiffView — file tabs + unified diff with line numbers and add/del tints.
 * Signature motion: added lines light up in sequence on first render
 * (60ms stagger, capped at 1.2s total), once. Code is always LTR and scrolls
 * horizontally inside the component, never the page.
 */
export function DiffView({
  files,
  newFileLabel = "new file",
  animate = true,
  className,
}: {
  files: DiffFile[];
  newFileLabel?: string;
  animate?: boolean;
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const file = files[Math.min(active, files.length - 1)];
  const rows = useMemo(() => (file ? parseUnifiedDiff(file.diff) : []), [file]);
  const counts = useMemo(
    () =>
      files.map((f) => {
        const r = parseUnifiedDiff(f.diff);
        return { adds: r.filter((x) => x.kind === "add").length, dels: r.filter((x) => x.kind === "del").length };
      }),
    [files],
  );
  // Sliding indicator under the active tab
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = tabRefs.current[active];
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active, files.length]);

  if (!file) return null;
  let addIndex = 0;

  return (
    <div className={cn("o-well min-w-0 overflow-hidden rounded-xl", className)} dir="ltr">
      <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-edge px-3 py-2">
        <div className="relative flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
          {files.map((f, i) => (
            <button
              key={f.path + i}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn(
                "relative shrink-0 rounded-md px-2 py-1 font-mono text-[11.5px] transition-colors duration-[var(--dur-hover)] pointer-coarse:min-h-11",
                i === active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.path}{" "}
              <span className="text-faint">
                (<span className="text-tel-emerald">+{counts[i].adds}</span> <span className="text-tel-rose">−{counts[i].dels}</span>
                {f.isNewFile && <> · {newFileLabel}</>})
              </span>
            </button>
          ))}
          {bar && (
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-2 h-px bg-foreground transition-[transform,width] duration-[var(--dur-state)] ease-[var(--ease-out-expo)]"
              style={{ width: bar.width, transform: `translateX(${bar.left}px)` }}
            />
          )}
        </div>
      </div>
      <div className="overflow-x-auto py-2 font-mono text-[12px] leading-[1.75]">
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((r, i) => {
              if (r.kind === "hunk") {
                return (
                  <tr key={i}>
                    <td colSpan={4} className="bg-foreground/[0.03] px-3 py-0.5 text-[11px] text-faint">
                      {r.text}
                    </td>
                  </tr>
                );
              }
              const delay = r.kind === "add" ? Math.min(addIndex++ * 60, 1200) : 0;
              return (
                <tr
                  key={i}
                  className={cn(
                    r.kind === "add" && "bg-diff-add",
                    r.kind === "del" && "bg-diff-del",
                    r.kind === "add" && animate && "o-anim o-diff-sweep",
                  )}
                  style={r.kind === "add" && animate ? { animationDelay: `${delay}ms` } : undefined}
                >
                  <td className="w-9 select-none pe-1 text-end text-faint">{r.oldNo ?? ""}</td>
                  <td className="w-9 select-none pe-2 text-end text-faint">{r.newNo ?? ""}</td>
                  <td
                    className={cn(
                      "w-4 select-none text-center",
                      r.kind === "add" && "text-tel-emerald",
                      r.kind === "del" && "text-tel-rose",
                    )}
                  >
                    {r.kind === "add" ? "+" : r.kind === "del" ? "−" : ""}
                  </td>
                  <td className="whitespace-pre pe-4">{r.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
