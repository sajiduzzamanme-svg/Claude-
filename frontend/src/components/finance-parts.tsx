"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, type ReactNode } from "react";
import { useProjects } from "@/components/forms";
import { Card, CountUp, cn, ease, rise } from "@/components/ui";
import { useT } from "@/lib/i18n";

/** Pill row for switching project; picks the first project when nothing is chosen. */
export function ProjectChips({ value, onChange, all }: { value: string; onChange: (v: string) => void; all?: string }) {
  const { rows: unsorted } = useProjects();
  const rows = [...unsorted].sort((a, b) => a.id - b.id);
  const first = rows[0]?.id;
  const id = useId();
  useEffect(() => {
    if (!value && !all && first) onChange(String(first));
  }, [first, value, all, onChange]);
  const items = [...(all ? [{ id: "", code: all, name: "" }] : []), ...rows.map((p) => ({ id: String(p.id), code: p.code, name: p.name }))];
  return (
    <div className="scroll-thin flex gap-2 overflow-x-auto pb-1">
      {items.map((p) => {
        const active = value === p.id;
        return (
          <button key={p.id || "all"} type="button" onClick={() => onChange(p.id)}
            className={cn("relative whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors", active ? "border-ink text-paper" : "border-line bg-card text-ink-soft hover:border-ink")}>
            {active && <motion.span layoutId={`chip-${id}`} className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
            <span className="relative z-10"><b className="font-semibold">{p.code}</b>{p.name && <span className={cn("ml-2 hidden sm:inline", active ? "text-paper/70" : "text-mute")}>{p.name}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Animated open/close of a block of content. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.32, ease }} className="overflow-hidden">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return <ChevronDown className={cn("size-4 shrink-0 text-mute transition-transform duration-300", open && "rotate-180", className)} />;
}

const STAT_TONES = {
  leaf: "bg-leaf-wash text-leaf", brass: "bg-brass-wash text-[#8a6410]", sky: "bg-sky-wash text-sky", brick: "bg-brick-wash text-brick-deep",
  rose: "bg-rose-wash text-rose", plum: "bg-plum-wash text-plum", ink: "bg-ink text-paper", neutral: "bg-paper-deep text-ink-soft",
};
export type StatTone = keyof typeof STAT_TONES;

/** Small headline number with an icon. */
export function Stat({ icon, label, value, format, hint, tone = "neutral", danger }: {
  icon: ReactNode; label: ReactNode; value: number; format: (v: number) => string; hint?: ReactNode; tone?: StatTone; danger?: boolean;
}) {
  return (
    <motion.div variants={rise}>
      <Card hover className="flex h-full items-start gap-3.5 p-4">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", STAT_TONES[tone])}>{icon}</span>
        <div className="min-w-0">
          <div className="truncate text-[13px] text-mute">{label}</div>
          <CountUp value={value} format={format} className={cn("block text-[22px] font-bold leading-tight tracking-tight", danger && "text-rose")} />
          {hint && <div className="mt-0.5 truncate text-xs text-mute">{hint}</div>}
        </div>
      </Card>
    </motion.div>
  );
}

/** One track = the budget; billed and paid are drawn inside it. Over-billing spills in rose. */
export function LayerBar({ budget, billed, paid, height = 12 }: { budget: number; billed: number; paid: number; height?: number }) {
  const scale = Math.max(budget, billed, 1);
  const over = billed > budget && budget > 0;
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
  return (
    <div className="relative w-full overflow-hidden rounded-full bg-paper-deep" style={{ height }}>
      <motion.div className={cn("absolute inset-y-0 left-0 rounded-full", over ? "bg-rose/80" : "bg-brick/75")} initial={{ width: 0 }} whileInView={{ width: w(billed) }} viewport={{ once: true }} transition={{ duration: 0.9, ease }} />
      <motion.div className="absolute inset-y-0 left-0 rounded-full bg-leaf" initial={{ width: 0 }} whileInView={{ width: w(paid) }} viewport={{ once: true }} transition={{ duration: 0.9, ease, delay: 0.15 }} />
      {over && <div className="absolute inset-y-[-2px] w-[2px] bg-ink" style={{ left: `calc(${w(budget)} - 1px)` }} />}
    </div>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <i className={cn("inline-block size-2.5 shrink-0 rounded-[3px]", className)} style={{ background: color }} />;
}

/** "3 days ago"-style helper kept deliberately simple and bilingual. */
export function useWhen() {
  const { t, n, date } = useT();
  return (iso: string) => {
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return t("just now", "এইমাত্র");
    if (mins < 60) return t(`${mins} min ago`, `${n(mins)} মিনিট আগে`);
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return t(`${hrs} h ago`, `${n(hrs)} ঘণ্টা আগে`);
    return date(iso.slice(0, 10));
  };
}
