"use client";

import { motion } from "motion/react";
import { cn, ease } from "./ui";

export type FlatStatus = "AVAILABLE" | "HOLD" | "BOOKED" | "HANDED_OVER";
export type TowerFlat = { id?: number; floor: number; unit: string; status: FlatStatus; code?: string };

export const STATUS_FILL: Record<FlatStatus, string> = {
  AVAILABLE: "var(--color-card)",
  HOLD: "var(--color-line)",
  BOOKED: "var(--color-brass)",
  HANDED_OVER: "var(--color-leaf)",
};

/** A small elevation drawing of a project: one window per flat, lit when sold.
 *  Floors above `built` percent are drawn as an unfinished frame. */
export function Tower({ flats, storeys, built = 100, width = 120, height = 190, dark = false, delay = 0, label }: {
  flats: TowerFlat[]; storeys?: number; built?: number; width?: number; height?: number; dark?: boolean; delay?: number; label?: string;
}) {
  const floors = [...new Set(flats.map((f) => f.floor))].sort((a, b) => a - b);
  const units = [...new Set(flats.map((f) => f.unit))].sort();
  const nFloors = Math.max(floors.length, storeys ? storeys - 1 : 0, 1);
  const nUnits = Math.max(units.length, 1);
  const ground = 16;
  const roof = 10;
  const bodyH = height - ground - roof - 6;
  const floorH = bodyH / (nFloors + 0.6);
  const bodyW = width - 16;
  const x0 = 8;
  const baseY = height - ground;
  const line = dark ? "rgb(255 255 255 / 0.55)" : "var(--color-ink)";
  const wall = dark ? "var(--color-night-soft)" : "var(--color-paper-deep)";
  const builtFloors = Math.round(((nFloors + 1) * Math.min(Math.max(built, 0), 100)) / 100);
  const byKey = new Map(flats.map((f) => [`${f.floor}-${f.unit}`, f]));
  const gap = 4;
  const winW = (bodyW - gap * (nUnits + 1)) / nUnits;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <line x1={0} x2={width} y1={baseY + 0.5} y2={baseY + 0.5} stroke={line} strokeWidth={1.5} />
      {[...Array(6)].map((_, i) => (
        <line key={i} x1={i * (width / 5) - 6} x2={i * (width / 5) + 2} y1={baseY + 8} y2={baseY + 1} stroke={line} strokeWidth={1} opacity={0.4} />
      ))}
      {/* ground floor / parking */}
      <motion.g initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease, delay }}>
        <rect x={x0} y={baseY - floorH * 0.6} width={bodyW} height={floorH * 0.6} fill={wall} stroke={line} strokeWidth={1.2} />
        <rect x={x0 + bodyW / 2 - 7} y={baseY - floorH * 0.45} width={14} height={floorH * 0.45} fill={dark ? "var(--color-night)" : "var(--color-ink)"} opacity={0.85} />
      </motion.g>
      {[...Array(nFloors)].map((_, idx) => {
        const floor = floors[idx] ?? idx + 1;
        const y = baseY - floorH * 0.6 - floorH * (idx + 1);
        const isBuilt = idx + 1 < builtFloors || built >= 100;
        return (
          <motion.g key={idx} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.38, ease, delay: delay + 0.06 * (idx + 1) }}>
            <rect x={x0} y={y} width={bodyW} height={floorH} fill={isBuilt ? wall : "transparent"} stroke={line} strokeWidth={1.2} strokeDasharray={isBuilt ? "" : "3 3"} opacity={isBuilt ? 1 : 0.55} />
            {(units.length ? units : ["A"]).map((u, ui) => {
              const f = byKey.get(`${floor}-${u}`);
              const sold = f && (f.status === "BOOKED" || f.status === "HANDED_OVER");
              return (
                <motion.rect
                  key={u} x={x0 + gap + ui * (winW + gap)} y={y + floorH * 0.24} width={winW} height={floorH * 0.52} rx={1.5}
                  fill={f ? STATUS_FILL[f.status] : "transparent"} stroke={line} strokeWidth={0.9}
                  initial={{ opacity: 0 }} animate={{ opacity: f ? (isBuilt ? 1 : 0.8) : 0.25 }}
                  transition={{ delay: delay + 0.06 * (idx + 1) + 0.25 + (sold ? 0.15 : 0) }}
                />
              );
            })}
          </motion.g>
        );
      })}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: built >= 100 ? 1 : 0.5 }} transition={{ delay: delay + 0.06 * (nFloors + 2) }}>
        <rect x={x0 - 3} y={baseY - floorH * 0.6 - floorH * nFloors - roof + 4} width={bodyW + 6} height={roof - 4} fill={dark ? "var(--color-brass)" : "var(--color-brick)"} stroke={line} strokeWidth={1} />
        <line x1={x0 + bodyW * 0.72} x2={x0 + bodyW * 0.72} y1={baseY - floorH * 0.6 - floorH * nFloors - roof + 4} y2={baseY - floorH * 0.6 - floorH * nFloors - roof - 8} stroke={line} strokeWidth={1.2} />
      </motion.g>
    </svg>
  );
}

export type GridFlat = {
  id: number; code: string; floor: number; unit: string; status: FlatStatus; size_sqft: string; list_price: string;
  flat_type?: string; booking?: { id: number; number: string; customer: string } | null;
};

/** Interactive stacking plan: top floor first, one cell per flat. */
export function FlatGrid({ flats, selected, onSelect, renderMeta, selectable }: {
  flats: GridFlat[]; selected?: number | null; onSelect?: (f: GridFlat) => void;
  renderMeta?: (f: GridFlat) => React.ReactNode; selectable?: (f: GridFlat) => boolean;
}) {
  const floors = [...new Set(flats.map((f) => f.floor))].sort((a, b) => b - a);
  const units = [...new Set(flats.map((f) => f.unit))].sort();
  const cellTone: Record<FlatStatus, string> = {
    AVAILABLE: "border-ink/70 bg-card hover:bg-brass-wash",
    HOLD: "border-line bg-paper-deep text-mute hatch",
    BOOKED: "border-brass bg-brass-wash",
    HANDED_OVER: "border-leaf bg-leaf-wash",
  };
  return (
    <div className="scroll-thin overflow-x-auto">
      <div className="mx-auto w-fit min-w-full">
        <div className="mx-auto h-3 w-[calc(100%-56px)] translate-x-7 rounded-t-md bg-brick" />
        <div className="space-y-1.5 border-x-2 border-ink/80 bg-paper-deep/50 p-2">
          {floors.map((floor, fi) => (
            <motion.div key={floor} className="flex items-stretch gap-1.5"
              initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease, delay: 0.045 * (floors.length - fi) }}>
              <div className="tnum grid w-10 shrink-0 place-items-center rounded-md bg-ink text-xs font-semibold text-paper">{floor}F</div>
              {units.map((u) => {
                const f = flats.find((x) => x.floor === floor && x.unit === u);
                if (!f) return <div key={u} className="min-w-28 flex-1 rounded-md border border-dashed border-line" />;
                const can = onSelect && (selectable ? selectable(f) : true);
                return (
                  <button
                    key={u} type="button" disabled={!can} onClick={() => can && onSelect?.(f)}
                    className={cn(
                      "relative min-w-28 flex-1 rounded-md border px-2.5 py-2 text-left transition-[transform,box-shadow,background] duration-200",
                      cellTone[f.status], can ? "hover:-translate-y-0.5 hover:shadow-lift" : "cursor-default",
                      selected === f.id && "ring-2 ring-brick ring-offset-2 ring-offset-paper",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{f.code}</span>
                      <span className="tnum text-[11px] text-mute">{Number(f.size_sqft).toFixed(0)} sft</span>
                    </div>
                    <div className="mt-0.5 min-h-4 truncate text-[11.5px] text-ink-soft">{renderMeta?.(f)}</div>
                  </button>
                );
              })}
            </motion.div>
          ))}
          <div className="flex gap-1.5">
            <div className="w-10" />
            <div className="hatch grid h-7 flex-1 place-items-center rounded-md border border-line text-[10px] uppercase tracking-[0.2em] text-mute">Ground · Parking</div>
          </div>
        </div>
        <div className="h-1.5 bg-ink" />
      </div>
    </div>
  );
}

export function StatusLegend({ items }: { items: { status: FlatStatus; label: string; count?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft">
      {items.map((i) => (
        <span key={i.status} className="flex items-center gap-1.5">
          <i className="size-3 rounded-[3px] border border-ink/50" style={{ background: STATUS_FILL[i.status] }} />
          {i.label}{i.count !== undefined && <b className="tnum font-semibold text-ink">{i.count}</b>}
        </span>
      ))}
    </div>
  );
}
