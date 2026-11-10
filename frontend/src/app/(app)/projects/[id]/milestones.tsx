"use client";

import { Check, Flag, Pencil, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Block, Figure, Panel, useOnChange, useOnOpen } from "@/components/project-parts";
import { Badge, Button, Card, CountUp, Empty, ErrorNote, Field, Input, Modal, Skeleton, cn, ease, useAction } from "@/components/ui";
import { api, refreshAll, useList } from "@/lib/api";
import { useAuth, type Role } from "@/lib/auth";
import { daysFromToday, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Milestone, Project } from "@/lib/types";

const WRITERS: Role[] = ["OWNER", "ADMIN", "ENGINEER"];

export function MilestonesTab({ project }: { project: Project }) {
  const { t, pct, n } = useT();
  const { can } = useAuth();
  const { rows, loading } = useList<Milestone>(`/milestones?project=${project.id}`);
  const [form, setForm] = useState<{ open: boolean; item: Milestone | null }>({ open: false, item: null });
  const writer = can(WRITERS);

  const totalWeight = rows.reduce((a, m) => a + num(m.weight), 0);
  const overall = totalWeight ? rows.reduce((a, m) => a + num(m.weight) * m.progress, 0) / totalWeight : 0;
  const done = rows.filter((m) => m.progress >= 100).length;
  const late = rows.filter((m) => m.progress < 100 && (daysFromToday(m.planned_date) ?? 1) < 0).length;
  const current = rows.find((m) => m.progress < 100);

  return (
    <Panel className="space-y-5">
      <Block>
        <Card className="grid gap-6 p-5 sm:p-6 md:grid-cols-[auto_1fr] md:items-center">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{t("Building complete", "নির্মাণ সম্পন্ন")}</div>
            <CountUp value={overall} format={(v) => pct(v, 1)} className="text-[52px] font-bold leading-none tracking-tight" />
          </div>
          <div>
            {/* one segment per milestone, as wide as its share of the work */}
            <div className="flex h-5 gap-[3px] overflow-hidden rounded-full">
              {rows.map((m, i) => (
                <div key={m.id} className="relative overflow-hidden bg-paper-deep first:rounded-l-full last:rounded-r-full" style={{ flexGrow: num(m.weight), flexBasis: 0 }} title={m.name}>
                  <motion.div className={cn("h-full", m.progress >= 100 ? "bg-leaf" : "bg-brass")} initial={{ width: 0 }} animate={{ width: `${m.progress}%` }} transition={{ duration: 0.7, ease, delay: 0.08 * i }} />
                </div>
              ))}
              {!rows.length && <div className="h-full w-full rounded-full bg-paper-deep" />}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <Figure label={t("Finished", "সম্পন্ন")}>{n(done)} <span className="text-sm font-normal text-mute">/ {n(rows.length)}</span></Figure>
              <Figure label={t("Running late", "পিছিয়ে আছে")} tone={late ? "rose" : undefined}>{n(late)}</Figure>
              <Figure label={t("Now on", "এখন চলছে")}><span className="line-clamp-1 text-[15px]">{current?.name ?? t("All done", "সব সম্পন্ন")}</span></Figure>
            </div>
          </div>
        </Card>
      </Block>

      <Block>
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">{t("Milestones", "মাইলস্টোন")}</h2>
              <p className="mt-0.5 text-[13px] text-mute">{t("Weight is each stage's share of the whole job. Drag a slider to report progress from site.", "ওজন হলো পুরো কাজে প্রতিটি ধাপের অংশ। সাইট থেকে অগ্রগতি জানাতে স্লাইডার টানুন।")}</p>
            </div>
            {writer && <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setForm({ open: true, item: null })}>{t("Add milestone", "মাইলস্টোন যোগ করুন")}</Button>}
          </div>
          {loading && !rows.length ? <Skeleton className="h-80" /> : rows.length === 0 ? (
            <Empty icon={<Flag />} title={t("No milestones yet", "এখনো কোনো মাইলস্টোন নেই")} hint={t("Break the build into stages such as piling, structure, finishing and handover.", "নির্মাণকে ধাপে ভাগ করুন: পাইলিং, স্ট্রাকচার, ফিনিশিং, হস্তান্তর।")} />
          ) : (
            <ol className="relative">
              {/* the rail */}
              <div className="absolute bottom-4 left-[15px] top-4 w-[2px] bg-line" />
              <motion.div className="absolute left-[15px] top-4 w-[2px] origin-top bg-leaf" initial={{ height: 0 }} animate={{ height: `calc(${rows.length ? (done / rows.length) * 100 : 0}% - ${done === rows.length ? 32 : 0}px)` }} transition={{ duration: 1.1, ease, delay: 0.2 }} />
              {rows.map((m, i) => <MilestoneRow key={m.id} m={m} index={i} share={totalWeight ? (num(m.weight) / totalWeight) * 100 : 0} writer={writer} onEdit={() => setForm({ open: true, item: m })} />)}
            </ol>
          )}
        </Card>
      </Block>

      <MilestoneForm state={form} onClose={() => setForm((s) => ({ ...s, open: false }))} project={project} nextSeq={Math.max(0, ...rows.map((r) => r.sequence)) + 1} />
    </Panel>
  );
}

function MilestoneRow({ m, index, share, writer, onEdit }: { m: Milestone; index: number; share: number; writer: boolean; onEdit: () => void }) {
  const { t, date, pct, n } = useT();
  const { busy, error, run } = useAction();
  const [value, setValue] = useState(m.progress);
  useOnChange(m.progress, setValue); // follow the saved value when it changes on the server
  const done = m.progress >= 100;
  const started = m.progress > 0;
  const days = daysFromToday(m.planned_date);
  const late = !done && days !== null && days < 0;

  const commit = (v: number) => {
    if (timer.current) clearTimeout(timer.current);
    if (v === m.progress) return;
    void run(async () => { await api.patch(`/milestones/${m.id}`, { progress: v }); await refreshAll(); }, v >= 100 ? t("Milestone completed", "মাইলস্টোন সম্পন্ন") : t("Progress updated", "অগ্রগতি আপডেট হয়েছে"));
  };
  // Arrow keys move in steps; save once the user pauses instead of on every press.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitSoon = (v: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), 600);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <motion.li initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease, delay: 0.06 * index }} className="relative flex gap-4 pb-4 last:pb-0">
      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.1 + 0.06 * index }}
        className={cn("tnum relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold", done ? "border-leaf bg-leaf text-white" : started ? "border-brass bg-brass text-ink" : "border-line bg-card text-mute")}>
        {done ? <Check className="size-4" strokeWidth={3} /> : n(m.sequence)}
      </motion.span>
      <div className={cn("min-w-0 flex-1 rounded-2xl border p-4 transition-colors", done ? "border-leaf/30 bg-leaf-wash/30" : late ? "border-rose/30 bg-rose-wash/30" : started ? "border-brass/40 bg-brass-wash/20" : "border-line")}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <h3 className="font-semibold">{m.name}</h3>
            <p className="mt-0.5 text-[13px] text-mute">
              {t("Planned", "পরিকল্পিত")} {m.planned_date ? date(m.planned_date) : "—"}
              {done && m.completed_date && <> · {t("finished", "সম্পন্ন")} {date(m.completed_date)}</>}
              {" · "}{t("weight", "ওজন")} {pct(share, 0)}
            </p>
            {m.notes && <p className="mt-1 text-[13px] text-ink-soft">{m.notes}</p>}
          </div>
          <div className="flex items-center gap-1.5">
            {late && <Badge tone="rose" dot>{t(`${-days!} days late`, `${n(-days!)} দিন দেরি`)}</Badge>}
            {!done && !late && days !== null && days <= 30 && <Badge tone="brass">{days === 0 ? t("Due today", "আজ শেষ তারিখ") : t(`${days} days left`, `${n(days)} দিন বাকি`)}</Badge>}
            {writer && (
              <>
                <button type="button" title={t("Edit", "সম্পাদনা")} onClick={onEdit} className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-paper-deep hover:text-ink"><Pencil className="size-4" /></button>
                <button type="button" title={t("Delete", "মুছুন")} disabled={busy} onClick={() => run(async () => { await api.del(`/milestones/${m.id}`); await refreshAll(); }, t("Milestone deleted", "মাইলস্টোন মুছে ফেলা হয়েছে"))} className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-rose-wash hover:text-rose"><Trash2 className="size-4" /></button>
              </>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-3 flex-1">
            <div className="absolute inset-0 overflow-hidden rounded-full bg-paper-deep">
              <motion.div className={cn("h-full rounded-full", value >= 100 ? "bg-leaf" : "bg-brass")} initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.5, ease }} />
            </div>
            {writer && (
              <input type="range" min={0} max={100} step={5} value={value} aria-label={t(`Progress of ${m.name}`, `${m.name}-এর অগ্রগতি`)}
                onChange={(e) => setValue(Number(e.target.value))}
                onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
                onKeyUp={(e) => commitSoon(Number((e.target as HTMLInputElement).value))}
                onBlur={(e) => commit(Number(e.target.value))}
                className="peer absolute inset-0 z-10 h-full w-full cursor-ew-resize opacity-0" />
            )}
            {writer && <motion.span className="pointer-events-none absolute top-1/2 size-5 -translate-y-1/2 rounded-full border-2 border-ink bg-card shadow peer-focus-visible:ring-4 peer-focus-visible:ring-brass/50" animate={{ left: `calc(${value}% - ${(value / 100) * 20}px)` }} transition={{ duration: 0.2 }} />}
          </div>
          <span className="tnum w-12 text-right text-sm font-bold">{pct(value)}</span>
        </div>
        {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      </div>
    </motion.li>
  );
}

function MilestoneForm({ state, onClose, project, nextSeq }: { state: { open: boolean; item: Milestone | null }; onClose: () => void; project: Project; nextSeq: number }) {
  const { t } = useT();
  const { busy, error, run, setError } = useAction();
  const [f, setF] = useState({ name: "", sequence: "1", weight: "10", planned_date: "", notes: "" });
  const item = state.item;
  useOnOpen(state.open, () => {
    setError("");
    setF(item ? { name: item.name, sequence: String(item.sequence), weight: String(num(item.weight)), planned_date: item.planned_date ?? "", notes: item.notes }
      : { name: "", sequence: String(nextSeq), weight: "10", planned_date: "", notes: "" });
  });

  async function submit() {
    const body = { project: project.id, name: f.name.trim(), sequence: Number(f.sequence) || 1, weight: f.weight || "1", planned_date: f.planned_date || null, notes: f.notes };
    const ok = await run(async () => {
      if (item) await api.patch(`/milestones/${item.id}`, body);
      else await api.post("/milestones", body);
      await refreshAll();
      return true;
    }, item ? t("Milestone updated", "মাইলস্টোন আপডেট হয়েছে") : t("Milestone added", "মাইলস্টোন যোগ হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={state.open} onClose={onClose} title={item ? t("Edit milestone", "মাইলস্টোন সম্পাদনা") : t("Add milestone", "মাইলস্টোন যোগ করুন")} subtitle={project.code}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!f.name.trim() || !(num(f.weight) > 0)} onClick={submit}>{t("Save", "সেভ করুন")}</Button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t("Stage of work", "কাজের ধাপ")} required className="sm:col-span-4"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("e.g. Structure up to roof", "যেমন: ছাদ পর্যন্ত স্ট্রাকচার")} /></Field>
        <Field label={t("Order", "ক্রম")}><Input className="tnum" inputMode="numeric" value={f.sequence} onChange={(e) => setF({ ...f, sequence: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label={t("Weight", "ওজন")} required hint={t("Share of the whole job", "পুরো কাজের অংশ")}><Input className="tnum" inputMode="decimal" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        <Field label={t("Planned finish", "পরিকল্পিত সমাপ্তি")} className="sm:col-span-2"><Input type="date" value={f.planned_date} onChange={(e) => setF({ ...f, planned_date: e.target.value })} /></Field>
        <Field label={t("Notes", "নোট")} className="sm:col-span-4"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <div className="sm:col-span-4"><ErrorNote>{error}</ErrorNote></div>
      </div>
    </Modal>
  );
}
