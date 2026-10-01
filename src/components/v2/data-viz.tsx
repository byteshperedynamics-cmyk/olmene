"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "./count-up";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ── KpiTile ───────────────────────────────────────────────────────────── */

export function KpiTile({
  label,
  value,
  unit,
  delta,
  positive,
  className,
}: {
  label: string;
  value: number | string;
  unit?: string;
  delta?: string;
  /** Green only for a verified positive change. */
  positive?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid min-w-0 gap-0.5 rounded-xl border bg-card px-3.5 py-3", className)}>
      <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{label}</span>
      <span className="font-display text-[28px] font-medium leading-tight tabular-nums">
        {typeof value === "number" ? <CountUp value={value} /> : value}
        {unit && <span className="ms-0.5 text-base text-faint">{unit}</span>}
      </span>
      {delta && (
        <span className={cn("font-mono text-[11px] leading-snug text-pretty", positive ? "text-primary" : "text-muted-foreground")}>{delta}</span>
      )}
    </div>
  );
}

/* ── ImpactChart ───────────────────────────────────────────────────────── */

export interface ChartPoint {
  /** day index or timestamp — any monotonically increasing number */
  x: number;
  y: number;
}
export interface ChartMarker {
  x: number;
  label: string;
}

/** Round a max up to a "nice" axis ceiling and return evenly spaced ticks. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * ImpactChart — hand-rolled SVG line + area with amber event markers.
 * One linear scale per axis; tick labels only at values the axis reaches;
 * marker labels nudged apart so they never overlap. Signature motion: the line
 * draws left→right once (2.4s), the latest point pulses.
 */
export function ImpactChart({
  points,
  markers = [],
  xLabel,
  ariaLabel,
  formatX = (x) => String(x),
  className,
}: {
  points: ChartPoint[];
  markers?: ChartMarker[];
  xLabel?: (x: number) => string;
  ariaLabel: string;
  formatX?: (x: number) => string;
  className?: string;
}) {
  const W = 640;
  const H = 230;
  const L = 44;
  const R = 624;
  const T = 22;
  const B = 196;
  const lineRef = useRef<SVGPathElement | null>(null);
  const [len, setLen] = useState(0);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const xs = points.map((p) => p.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const ticks = niceTicks(Math.max(...points.map((p) => p.y)));
    const yMax = ticks[ticks.length - 1] || 1;
    const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (R - L);
    const sy = (y: number) => B - (y / yMax) * (B - T);
    const line = "M" + points.map((p) => `${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" L");
    const area = `${line} L${R} ${B} L${L} ${B} Z`;
    const last = points[points.length - 1];
    // x ticks: 5 evenly spaced positions snapped to real data x values
    const xt = [0, 0.25, 0.5, 0.75, 1].map((f) => points[Math.round(f * (points.length - 1))].x);
    // marker label positions, nudged so labels (≈46px wide) never overlap
    const placed: { x: number; lx: number; label: string }[] = [];
    [...markers]
      .filter((m) => m.x >= x0 && m.x <= x1)
      .sort((a, b) => a.x - b.x)
      .forEach((m) => {
        const px = sx(m.x);
        let lx = px + 4;
        const prev = placed[placed.length - 1];
        if (prev && lx < prev.lx + 50) lx = prev.lx + 50;
        lx = Math.min(lx, R - 44);
        placed.push({ x: px, lx, label: m.label });
      });
    return { ticks, sx, sy, line, area, last: { x: sx(last.x), y: sy(last.y) }, xt, placed };
  }, [points, markers]);

  useIsoLayoutEffect(() => {
    if (lineRef.current) setLen(lineRef.current.getTotalLength());
  }, [geo?.line]);

  if (!geo) return null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("block h-auto w-full overflow-visible", className)} role="img" aria-label={ariaLabel}>
      <defs>
        <linearGradient id="o-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.26" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g>
        {geo.ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={R} y1={geo.sy(v)} y2={geo.sy(v)} stroke="var(--border)" strokeWidth={1} />
            <text x={L - 8} y={geo.sy(v) + 3} textAnchor="end" fill="var(--faint)" fontFamily="var(--font-mono-code), monospace" fontSize={10}>
              {v}
            </text>
          </g>
        ))}
        {geo.xt.map((x, i) => (
          <text key={i} x={geo.sx(x)} y={B + 18} textAnchor="middle" fill="var(--faint)" fontFamily="var(--font-mono-code), monospace" fontSize={10}>
            {(xLabel ?? formatX)(x)}
          </text>
        ))}
      </g>
      <path d={geo.area} fill="url(#o-area)" />
      <path
        ref={lineRef}
        d={geo.line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={len ? "o-anim animate-[o-draw_2.4s_var(--ease-out-expo)_both]" : undefined}
        style={len ? ({ strokeDasharray: len, "--o-len": len } as React.CSSProperties) : undefined}
      />
      {geo.placed.map((m) => (
        <g key={m.label + m.x}>
          <line x1={m.x} x2={m.x} y1={T} y2={B} stroke="var(--signal-amber)" strokeWidth={1} strokeDasharray="3 3" />
          <text x={m.lx} y={T - 6} fill="var(--signal-amber)" fontFamily="var(--font-mono-code), monospace" fontSize={10}>
            {m.label}
          </text>
        </g>
      ))}
      <circle
        cx={geo.last.x}
        cy={geo.last.y}
        r={4}
        fill="none"
        stroke="var(--primary)"
        className="o-anim animate-[o-ring_2s_ease-out_infinite] [transform-box:fill-box] [transform-origin:center]"
      />
      <circle cx={geo.last.x} cy={geo.last.y} r={4} fill="var(--primary)" />
    </svg>
  );
}

/* ── MetricBars ────────────────────────────────────────────────────────── */

export function MetricBars({
  values,
  max,
  yLabels,
  xLabels,
  title,
  format = (v) => String(v),
  className,
}: {
  values: number[];
  max: number;
  yLabels: [string, string, string];
  xLabels: string[];
  title: string;
  format?: (v: number) => string;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[34px_1fr] gap-1.5", className)} role="img" aria-label={title}>
      <div className="flex h-[130px] flex-col justify-between text-end font-mono text-[9.5px] text-faint" aria-hidden>
        <span>{yLabels[0]}</span>
        <span>{yLabels[1]}</span>
        <span>{yLabels[2]}</span>
      </div>
      <div
        className="relative flex h-[130px] items-end gap-[5px] border-b border-line-strong"
        style={{ background: "repeating-linear-gradient(to top, var(--border) 0 1px, transparent 1px 32.5px)" }}
        aria-hidden
      >
        {values.map((v, i) => (
          <i
            key={i}
            title={format(v)}
            className="o-anim block flex-1 origin-bottom rounded-t-[3px] bg-gradient-to-t from-primary/55 to-primary animate-[o-rise_1.4s_var(--ease-out-expo)_both]"
            style={{ height: `${Math.max(2, (v / max) * 100)}%`, animationDelay: `${i * 70}ms` }}
          />
        ))}
      </div>
      <div className="col-start-2 flex justify-between font-mono text-[9.5px] text-faint" aria-hidden>
        {xLabels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}

/* ── MergeRing ─────────────────────────────────────────────────────────── */

export function MergeRing({ pct, className }: { pct: number; className?: string }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 76 76" className={cn("size-[76px] shrink-0 -rotate-90", className)} aria-hidden>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="8"
        strokeLinecap="round"
        className="o-anim animate-[o-ringfill_2s_var(--ease-out-expo)_both]"
        style={{ strokeDasharray: c, strokeDashoffset: c * (1 - pct / 100), "--o-circ": c } as React.CSSProperties}
      />
    </svg>
  );
}

/* ── FixFeed ───────────────────────────────────────────────────────────── */

export interface FeedItem {
  id: string;
  title: string;
  site: string;
  ago: string;
}

/**
 * Vertically scrolling ticker; pauses on hover/focus. Screen readers get the
 * static list (the duplicate used for the seamless loop is aria-hidden).
 */
export function FixFeed({ items, mergedLabel, className }: { items: FeedItem[]; mergedLabel: string; className?: string }) {
  if (!items.length) return null;
  const row = (it: FeedItem, hidden: boolean, k: string) => (
    <li key={k} aria-hidden={hidden || undefined} className="flex min-w-0 items-center gap-2 text-[12.5px]">
      <span className="shrink-0 rounded-full bg-leaf-soft px-2 py-0.5 font-mono text-[10.5px] text-primary">{mergedLabel}</span>
      <span className="min-w-0 truncate" title={`${it.title} · ${it.site}`}>
        {it.title} <span className="text-muted-foreground">· {it.site}</span>
      </span>
      <span className="ms-auto shrink-0 font-mono text-[10.5px] text-faint">{it.ago}</span>
    </li>
  );
  return (
    <div className={cn("group relative h-[156px] overflow-hidden", className)} tabIndex={0}>
      <ul
        className={cn(
          "o-anim grid gap-2.5 group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]",
          items.length > 4 && "animate-[o-feed_14s_linear_infinite]",
        )}
      >
        {items.map((it) => row(it, false, it.id))}
        {items.length > 4 && items.map((it) => row(it, true, it.id + "-dup"))}
      </ul>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-t from-transparent to-card" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-card" aria-hidden />
    </div>
  );
}

/* ── ConnectDiagram ────────────────────────────────────────────────────── */

export type WireState = "connected" | "pending" | "off";

export interface DiagramNode {
  key: string;
  label: string;
  status: string;
  state: WireState;
}

/**
 * Sources wired into the flower. Connected wires flow green (1.4s), pending
 * wires flow faint and slow (3s), off wires are static. Two nodes (left
 * column) or three (adds a right-hand source, e.g. Search Console).
 */
export function ConnectDiagram({
  nodes,
  center,
  ariaLabel,
  className,
}: {
  /** top-left, bottom-left, and optionally right */
  nodes: [DiagramNode, DiagramNode] | [DiagramNode, DiagramNode, DiagramNode];
  center: React.ReactNode;
  ariaLabel: string;
  className?: string;
}) {
  const three = nodes.length === 3;
  const cx = three ? 180 : 230;
  const wires = [
    { d: `M104 50 C${cx - 34} 50 ${cx - 40} 130 ${cx} 130`, n: nodes[0] },
    { d: `M104 210 C${cx - 34} 210 ${cx - 40} 130 ${cx} 130`, n: nodes[1] },
    ...(three ? [{ d: "M256 130 L180 130", n: nodes[2] as DiagramNode }] : []),
  ];
  const boxes = [
    { x: 8, y: 28, w: 96, n: nodes[0] },
    { x: 8, y: 188, w: 96, n: nodes[1] },
    ...(three ? [{ x: 256, y: 108, w: 98, n: nodes[2] as DiagramNode }] : []),
  ];
  return (
    <svg viewBox={three ? "0 0 362 260" : "0 0 290 260"} className={cn("block h-auto w-full", className)} role="img" aria-label={ariaLabel} direction="ltr">
      <circle cx={cx} cy="130" r="46" fill="var(--leaf-soft)" />
      {wires.map((w) => (
        <g key={w.n.key}>
          <path d={w.d} fill="none" stroke="var(--line-strong)" strokeWidth={1.5} />
          {w.n.state !== "off" && (
            <path
              d={w.d}
              fill="none"
              stroke={w.n.state === "connected" ? "var(--primary)" : "var(--faint)"}
              strokeWidth={2}
              strokeDasharray="6 14"
              className={cn(
                "o-anim",
                w.n.state === "connected" ? "animate-[o-flow_1.4s_linear_infinite]" : "animate-[o-flow_3s_linear_infinite]",
              )}
            />
          )}
        </g>
      ))}
      {boxes.map((b) => (
        <g key={b.n.key}>
          <rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={44}
            rx={10}
            fill="var(--card)"
            stroke={b.n.state === "connected" ? "var(--primary)" : "var(--line-strong)"}
          />
          <text x={b.x + 12} y={b.y + 19} fill="var(--foreground)" fontSize={12} fontFamily="var(--font-inter), sans-serif">
            {b.n.label}
          </text>
          <text
            x={b.x + 12}
            y={b.y + 34}
            fill={b.n.state === "connected" ? "var(--primary)" : "var(--faint)"}
            fontSize={9.5}
            letterSpacing="0.08em"
            fontFamily="var(--font-mono-code), monospace"
          >
            {b.n.status.toUpperCase()}
          </text>
        </g>
      ))}
      <foreignObject x={cx - 26} y="104" width="52" height="52">
        <div className="grid size-full place-items-center">{center}</div>
      </foreignObject>
    </svg>
  );
}
