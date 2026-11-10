"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn, ease } from "./ui";

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

export type FlowPoint = { label: string; inflow: number; outflow?: number; line?: number };

/** Money in vs money out per month, with an optional running-balance line. */
export function FlowChart({ data, height = 260, fmt, inLabel, outLabel, lineLabel, showOut = true }: {
  data: FlowPoint[]; height?: number; fmt: (n: number) => string; inLabel: string; outLabel: string; lineLabel?: string; showOut?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 8, r: 8, t: 18, b: 28 };
  const w = Math.max(width, 200);
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const hasLine = data.some((d) => d.line !== undefined);
  const barMax = niceMax(Math.max(...data.map((d) => Math.max(d.inflow, d.outflow ?? 0)), 1));
  const lineVals = data.map((d) => d.line ?? 0);
  const lineMin = Math.min(0, ...lineVals);
  const lineMax = niceMax(Math.max(...lineVals, 1));
  const band = innerW / Math.max(data.length, 1);
  const barW = Math.min(22, band * (showOut ? 0.28 : 0.46));
  const y = (v: number) => pad.t + innerH - (v / barMax) * innerH;
  const ly = (v: number) => pad.t + innerH - ((v - lineMin) / (lineMax - lineMin || 1)) * innerH;
  const cx = (i: number) => pad.l + band * i + band / 2;
  const linePath = data.map((d, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${ly(d.line ?? 0).toFixed(1)}`).join(" ");

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={w} height={height} onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * g} y2={pad.t + innerH * g} stroke="var(--color-line)" strokeDasharray={g === 1 ? "" : "3 5"} strokeWidth={1} />
          ))}
          {hasLine && lineMin < 0 && (
            <line x1={pad.l} x2={w - pad.r} y1={ly(0)} y2={ly(0)} stroke="var(--color-rose)" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
          )}
          {data.map((d, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={innerH + pad.b} fill={hover === i ? "rgb(22 26 34 / 0.04)" : "transparent"} rx={8} />
              <motion.rect
                x={cx(i) - (showOut ? barW + 2 : barW / 2)} width={barW} rx={4} fill="var(--color-leaf)"
                initial={{ y: pad.t + innerH, height: 0 }} animate={{ y: y(d.inflow), height: pad.t + innerH - y(d.inflow) }}
                transition={{ duration: 0.7, ease, delay: 0.03 * i }}
              />
              {showOut && (
                <motion.rect
                  x={cx(i) + 2} width={barW} rx={4} fill="var(--color-brick)"
                  initial={{ y: pad.t + innerH, height: 0 }} animate={{ y: y(d.outflow ?? 0), height: pad.t + innerH - y(d.outflow ?? 0) }}
                  transition={{ duration: 0.7, ease, delay: 0.03 * i + 0.08 }}
                />
              )}
              <text x={cx(i)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--color-mute)">{d.label}</text>
            </g>
          ))}
          {hasLine && (
            <>
              <motion.path d={linePath} fill="none" stroke="var(--color-ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease, delay: 0.3 }} />
              {data.map((d, i) => (
                <motion.circle key={i} cx={cx(i)} cy={ly(d.line ?? 0)} r={hover === i ? 5 : 3.5} fill={(d.line ?? 0) < 0 ? "var(--color-rose)" : "var(--color-card)"} stroke="var(--color-ink)" strokeWidth={2}
                  initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 + 0.05 * i }} style={{ pointerEvents: "none" }} />
              ))}
            </>
          )}
        </svg>
      )}
      <AnimatePresence>
        {hover !== null && data[hover] && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-xl bg-ink px-3 py-2.5 text-xs text-paper shadow-pop"
            style={{ left: Math.min(Math.max(cx(hover) - 88, 0), w - 176) }}
          >
            <div className="mb-1.5 font-semibold">{data[hover].label}</div>
            <Row color="var(--color-leaf)" label={inLabel} value={fmt(data[hover].inflow)} />
            {showOut && <Row color="var(--color-brick)" label={outLabel} value={fmt(data[hover].outflow ?? 0)} />}
            {hasLine && lineLabel && <Row color="var(--color-paper)" label={lineLabel} value={fmt(data[hover].line ?? 0)} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="flex items-center gap-1.5 opacity-80"><i className="size-2 rounded-full" style={{ background: color }} />{label}</span>
      <span className="tnum font-medium">{value}</span>
    </div>
  );
}

export type Segment = { label: string; value: number; color: string };

export function Donut({ segments, size = 168, thickness = 22, children }: { segments: Segment[]; size?: number; thickness?: number; children?: ReactNode }) {
  const total = segments.reduce((a, s) => a + Math.max(s.value, 0), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-paper-deep)" strokeWidth={thickness} />
        {total > 0 && segments.map((s, i) => {
          const frac = Math.max(s.value, 0) / total;
          const dash = Math.max(c * frac - 2, 0);
          const offset = -c * acc;
          acc += frac;
          return (
            <motion.circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={offset}
              initial={{ opacity: 0, strokeDasharray: `0 ${c}` }} animate={{ opacity: 1, strokeDasharray: `${dash} ${c - dash}` }}
              transition={{ duration: 0.9, ease, delay: 0.12 * i }} />
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Legend({ items, fmt, className }: { items: Segment[]; fmt: (n: number) => string; className?: string }) {
  return (
    <ul className={cn("space-y-2 text-sm", className)}>
      {items.map((s) => (
        <li key={s.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-ink-soft"><i className="size-2.5 rounded-[3px]" style={{ background: s.color }} />{s.label}</span>
          <span className="tnum font-medium">{fmt(s.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export type Step = { label: string; value: number; kind: "start" | "minus" | "plus" | "total" };

/** Revenue → costs → profit, drawn as a stepping bridge. */
export function Waterfall({ steps, fmt, height = 250 }: { steps: Step[]; fmt: (n: number) => string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const pad = { t: 26, b: 40, l: 4, r: 4 };
  const w = Math.max(width, 240);
  const innerH = height - pad.t - pad.b;
  let run = 0;
  const bars = steps.map((s) => {
    let from: number, to: number;
    if (s.kind === "start" || s.kind === "total") { from = 0; to = s.value; run = s.value; }
    else if (s.kind === "minus") { from = run; to = run - s.value; run = to; }
    else { from = run; to = run + s.value; run = to; }
    return { ...s, from, to };
  });
  const hi = Math.max(...bars.map((b) => Math.max(b.from, b.to)), 1);
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const y = (v: number) => pad.t + innerH - ((v - lo) / (hi - lo || 1)) * innerH;
  const band = (w - pad.l - pad.r) / bars.length;
  const bw = Math.min(64, band * 0.62);
  const color = (b: (typeof bars)[number]) =>
    b.kind === "start" ? "var(--color-ink)" : b.kind === "minus" ? "var(--color-brick)" : b.kind === "plus" ? "var(--color-leaf)" : b.to >= 0 ? "var(--color-leaf)" : "var(--color-rose)";
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width > 0 && (
        <svg width={w} height={height}>
          <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--color-line)" />
          {bars.map((b, i) => {
            const x = pad.l + band * i + (band - bw) / 2;
            const top = Math.min(y(b.from), y(b.to));
            const h = Math.max(Math.abs(y(b.from) - y(b.to)), 2);
            return (
              <g key={b.label}>
                {i < bars.length - 1 && (
                  <motion.line x1={x + bw} x2={x + band} y1={y(b.to)} y2={y(b.to)} stroke="var(--color-mute)" strokeDasharray="3 4"
                    initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ delay: 0.25 + 0.12 * i }} />
                )}
                <motion.rect x={x} width={bw} rx={6} fill={color(b)}
                  initial={{ y: y(b.from), height: 0 }} animate={{ y: top, height: h }} transition={{ duration: 0.6, ease, delay: 0.12 * i }} />
                <motion.text x={x + bw / 2} y={top - 8} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-ink)" className="tnum"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + 0.12 * i }}>
                  {b.kind === "minus" ? "−" : ""}{fmt(Math.abs(b.kind === "start" || b.kind === "total" ? b.to : b.value))}
                </motion.text>
                <text x={x + bw / 2} y={height - 18} textAnchor="middle" fontSize={11.5} fill="var(--color-mute)">{b.label}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function Spark({ values, color = "var(--color-brick)", width = 96, height = 30 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / (max - min || 1)) * (height - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height}>
      <motion.path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease }} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3} fill={color} />
    </svg>
  );
}

/** Estimate vs actual as two overlaid bars. */
export function DualBar({ estimate, actual, className }: { estimate: number; actual: number; className?: string }) {
  const max = Math.max(estimate, actual, 1);
  const over = actual > estimate && estimate > 0;
  return (
    <div className={cn("relative h-3.5 w-full overflow-hidden rounded-full bg-paper-deep", className)}>
      <motion.div className="hatch absolute inset-y-0 left-0 rounded-full bg-line" initial={{ width: 0 }} whileInView={{ width: `${(estimate / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease }} />
      <motion.div className={cn("absolute inset-y-0 left-0 rounded-full", over ? "bg-rose" : "bg-leaf")} initial={{ width: 0 }} whileInView={{ width: `${(actual / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease, delay: 0.15 }} style={{ opacity: 0.9 }} />
      {estimate > 0 && <div className="absolute inset-y-[-2px] w-[2px] bg-ink" style={{ left: `calc(${(estimate / max) * 100}% - 1px)` }} />}
    </div>
  );
}
