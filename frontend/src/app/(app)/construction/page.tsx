"use client";

import { CalendarDays, Handshake, HardHat, Pencil, Plus, ShieldHalf, TriangleAlert, Wrench } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LayerBar, ProjectChips, useOnOpen } from "@/components/finance-parts";
import { CostHeadSelect, ProjectSelect, StatusBadge } from "@/components/forms";
import { Guard, Page } from "@/components/shell";
import { Button, Card, Empty, ErrorNote, Field, Input, Modal, MoneyInput, Ring, Select, Skeleton, Textarea, cn, ease, rise, stagger, useAction, useToast } from "@/components/ui";
import { api, errorText, refreshAll, useList } from "@/lib/api";
import { ROLES, useAuth, type Role } from "@/lib/auth";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Milestone, Vendor, WorkPackage } from "@/lib/types";

const EDITORS: Role[] = ["OWNER", "ADMIN", "ENGINEER"];

export default function ConstructionPage() {
  return <Guard roles={ROLES.SITE}><Construction /></Guard>;
}

function Construction() {
  const { t, pct, n } = useT();
  const { can } = useAuth();
  const canEdit = can(EDITORS);
  const [project, setProject] = useState("");
  const [editing, setEditing] = useState<WorkPackage | "new" | null>(null);
  const { rows: packages, loading } = useList<WorkPackage>(project ? `/work-packages?project=${project}` : null);
  const { rows: milestones } = useList<Milestone>(project ? `/milestones?project=${project}` : null);

  const own = packages.filter((p) => p.execution === "OWN");
  const contracted = packages.filter((p) => p.execution === "CONTRACTOR");
  const weight = milestones.reduce((a, m) => a + num(m.weight), 0);
  const site = weight ? milestones.reduce((a, m) => a + num(m.weight) * m.progress, 0) / weight : 0;

  return (
    <Page
      eyebrow={<><HardHat className="size-3.5" />{t("Site", "সাইট")}</>}
      title={t("Construction", "নির্মাণ কাজ")}
      subtitle={t("Every slice of the build — done by our own team or handed to a contractor — with its budget, bills and progress.", "নির্মাণের প্রতিটি অংশ — নিজস্ব টিম বা ঠিকাদার — বাজেট, বিল ও অগ্রগতিসহ।")}
      actions={canEdit && <Button icon={<Plus className="size-4" />} disabled={!project} onClick={() => setEditing("new")}>{t("Add work package", "কাজের অংশ যোগ করুন")}</Button>}
    >
      <motion.div variants={rise}><ProjectChips value={project} onChange={setProject} /></motion.div>

      {/* ---------- site progress strip ---------- */}
      <motion.section variants={rise} className="bg-grid-night relative mt-5 overflow-hidden rounded-3xl bg-night p-5 text-paper shadow-lift sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-16 size-64 rounded-full bg-brass/20 blur-[100px]" />
        <div className="relative flex flex-wrap items-center gap-6">
          <Ring value={site} size={104} stroke={10} color="var(--color-brass)" track="rgb(255 255 255 / 0.1)">
            <div><div className="tnum text-2xl font-bold leading-none">{pct(site)}</div><div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-paper/50">{t("built", "নির্মিত")}</div></div>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-paper/45">{t("Site progress by milestone", "মাইলস্টোন অনুযায়ী সাইটের অগ্রগতি")}</p>
            {milestones.length === 0 ? (
              <p className="mt-3 text-sm text-paper/60">{t("No milestones yet. Add them from the project page.", "এখনো মাইলস্টোন নেই। প্রজেক্ট পেজ থেকে যোগ করুন।")}</p>
            ) : (
              <div className="scroll-thin mt-3 flex gap-1.5 overflow-x-auto pb-1">
                {milestones.map((m, i) => (
                  <div key={m.id} className="group min-w-14" style={{ flexGrow: Math.max(num(m.weight), 1), flexBasis: 0 }} title={`${m.name} · ${m.progress}%`}>
                    <div className="h-3.5 overflow-hidden rounded-[5px] bg-white/10">
                      <motion.div className={cn("h-full rounded-[5px]", m.progress >= 100 ? "bg-leaf" : "bg-brass")} initial={{ width: 0 }} animate={{ width: `${m.progress}%` }} transition={{ duration: 0.8, ease, delay: 0.2 + i * 0.08 }} />
                    </div>
                    <div className="mt-1.5 truncate text-[11px] text-paper/55 transition group-hover:text-paper">{m.name}</div>
                    <div className={cn("tnum text-xs font-semibold", m.progress >= 100 ? "text-[#6fd3a6]" : m.progress > 0 ? "text-brass" : "text-paper/35")}>{pct(m.progress)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="tnum text-xl font-semibold">{n(own.length)}</div><div className="text-[11px] text-paper/50">{t("own team", "নিজস্ব টিম")}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="tnum text-xl font-semibold">{n(contracted.length)}</div><div className="text-[11px] text-paper/50">{t("contracted", "ঠিকাদার")}</div></div>
          </div>
        </div>
      </motion.section>

      {/* ---------- lanes ---------- */}
      {loading ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      ) : packages.length === 0 ? (
        <Card className="mt-5"><Empty icon={<Wrench />} title={t("No work packages for this project yet", "এই প্রজেক্টে এখনো কোনো কাজের অংশ নেই")} hint={t("Split the build into packages such as piling, structure and finishing, and choose who does each.", "নির্মাণকে পাইলিং, স্ট্রাকচার, ফিনিশিং-এর মতো অংশে ভাগ করুন এবং কে করবে ঠিক করুন।")} action={canEdit && <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>{t("Add work package", "কাজের অংশ যোগ করুন")}</Button>} /></Card>
      ) : (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
          <Lane icon={<HardHat className="size-5" />} tone="brass" title={t("Own team", "নিজস্ব টিম")} hint={t("We buy materials and pay labour ourselves", "মালামাল ও লেবার নিজেরাই")} items={own} canEdit={canEdit} onEdit={setEditing} />
          <Lane icon={<Handshake className="size-5" />} tone="brick" title={t("Contractor", "ঠিকাদার")} hint={t("Billed against a contract value, with retention", "চুক্তিমূল্যের বিপরীতে বিল, জামানতসহ")} items={contracted} canEdit={canEdit} onEdit={setEditing} />
        </div>
      )}

      <PackageModal target={editing} project={project} onClose={() => setEditing(null)} />
    </Page>
  );
}

function Lane({ icon, tone, title, hint, items, canEdit, onEdit }: {
  icon: React.ReactNode; tone: "brass" | "brick"; title: string; hint: string; items: WorkPackage[]; canEdit: boolean; onEdit: (w: WorkPackage) => void;
}) {
  const { t, short } = useT();
  const budget = items.reduce((a, w) => a + num(w.budget), 0);
  const billed = items.reduce((a, w) => a + num(w.billed), 0);
  return (
    <motion.section variants={rise} className="min-w-0 rounded-3xl border border-line bg-paper-deep/40 p-3 sm:p-4">
      <header className="mb-3 flex items-center gap-3 px-1">
        <span className={cn("grid size-10 place-items-center rounded-xl", tone === "brass" ? "bg-brass text-ink" : "bg-brick text-white")}>{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-tight">{title}</h2>
          <p className="truncate text-xs text-mute">{hint}</p>
        </div>
        <div className="text-right text-xs text-mute">
          <div>{t("Budget", "বাজেট")} <b className="tnum text-ink">{short(budget)}</b></div>
          <div>{t("Billed", "বিল")} <b className="tnum text-ink">{short(billed)}</b></div>
        </div>
      </header>
      {items.length === 0 ? (
        <div className="hatch rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-mute">{t("Nothing in this lane", "এই লেনে কিছু নেই")}</div>
      ) : (
        <motion.div variants={stagger} className="space-y-3">
          {items.map((w) => <PackageCard key={w.id} w={w} canEdit={canEdit} onEdit={() => onEdit(w)} />)}
        </motion.div>
      )}
    </motion.section>
  );
}

function PackageCard({ w, canEdit, onEdit }: { w: WorkPackage; canEdit: boolean; onEdit: () => void }) {
  const { t, taka, short, pct, date } = useT();
  const toast = useToast();
  const [value, setValue] = useState(w.progress);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Follow the server value, except while the user is still dragging or a save is in flight.
  useEffect(() => {
    if (!timer.current && !saving) setValue(w.progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.progress]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const budget = num(w.budget), billed = num(w.billed), paid = num(w.paid);
  const ratio = budget > 0 ? billed / budget : 0;
  const contractor = w.execution === "CONTRACTOR";
  // "Nearly used up" only matters while there is still work to bill.
  const flag = ratio > 1 ? "over" : ratio >= 0.9 && w.status !== "DONE" ? "near" : null;

  async function save(next: number) {
    setSaving(true);
    try {
      await api.patch(`/work-packages/${w.id}`, { progress: next });
      await refreshAll();
      toast.ok(t(`${w.name}: progress saved at ${next}%`, `${w.name}: অগ্রগতি সেভ হয়েছে`));
    } catch (e) {
      setValue(w.progress);
      toast.err(errorText(e));
    } finally {
      setSaving(false);
    }
  }
  /** Save once the slider has rested for a moment, so a drag or a run of key presses is one save. */
  function change(next: number) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (next !== w.progress) void save(next);
    }, 650);
  }

  return (
    <motion.div variants={rise} layout className="min-w-0">
      <Card hover className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold">{w.name}</h3>
            <p className="mt-0.5 truncate text-[13px] text-mute">{t(w.cost_head_name, w.cost_head_name_bn || w.cost_head_name)}{contractor && w.vendor_name ? ` · ${w.vendor_name}` : ""}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusBadge group="work" value={w.status} />
            {canEdit && <button onClick={onEdit} aria-label={t("Edit", "সম্পাদনা")} className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-paper-deep hover:text-ink"><Pencil className="size-4" /></button>}
          </div>
        </div>

        <div className="mt-4">
          <LayerBar budget={budget} billed={billed} paid={paid} />
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div><div className="text-mute">{contractor ? t("Contract", "চুক্তিমূল্য") : t("Budget", "বাজেট")}</div><div className="tnum text-sm font-semibold" title={taka(budget)}>{short(budget)}</div></div>
            <div><div className="flex items-center gap-1.5 text-mute"><i className={cn("size-2 rounded-full", flag === "over" ? "bg-rose" : "bg-brick/75")} />{t("Billed", "বিল হয়েছে")}</div><div className={cn("tnum text-sm font-semibold", flag === "over" && "text-rose")} title={taka(billed)}>{short(billed)} <span className="font-normal text-mute">{pct(ratio * 100)}</span></div></div>
            <div><div className="flex items-center gap-1.5 text-mute"><i className="size-2 rounded-full bg-leaf" />{t("Paid", "পরিশোধ")}</div><div className="tnum text-sm font-semibold" title={taka(paid)}>{short(paid)}</div></div>
          </div>
          {flag && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={cn("mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[13px]", flag === "over" ? "bg-rose-wash text-rose" : "bg-brass-wash text-[#8a6410]")}>
              <TriangleAlert className="size-4 shrink-0" />
              {flag === "over"
                ? t(`Billing is ${taka(billed - budget)} above the ${contractor ? "contract value" : "budget"}.`, `বিল ${contractor ? "চুক্তিমূল্যের" : "বাজেটের"} চেয়ে ${taka(billed - budget)} বেশি।`)
                : t(`Only ${taka(budget - billed)} left before the ${contractor ? "contract value" : "budget"} is used up.`, `${contractor ? "চুক্তিমূল্য" : "বাজেট"} শেষ হতে আর ${taka(budget - billed)} বাকি।`)}
            </motion.div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
          {(w.start_date || w.end_date) && <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{date(w.start_date)} → {date(w.end_date)}</span>}
          {contractor && num(w.retention_percent) > 0 && <span className="flex items-center gap-1.5"><ShieldHalf className="size-3.5" />{t("Retention", "জামানত")} {pct(w.retention_percent, num(w.retention_percent) % 1 ? 1 : 0)}</span>}
          {w.notes && <span className="truncate">{w.notes}</span>}
        </div>

        <div className="mt-4 rounded-xl bg-paper-deep/60 px-3.5 py-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-mute">{t("Work done", "কাজের অগ্রগতি")}</span>
            <span className={cn("tnum text-sm font-bold", saving && "animate-pulse-soft")}>{pct(value)}</span>
          </div>
          {canEdit ? (
            <input type="range" min={0} max={100} step={5} value={value} aria-label={t("Work done", "কাজের অগ্রগতি")}
              onChange={(e) => change(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-brick" />
          ) : (
            <div className="h-2 overflow-hidden rounded-full bg-line"><motion.div className="h-full rounded-full bg-ink" initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.8, ease }} /></div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

function PackageModal({ target, project, onClose }: { target: WorkPackage | "new" | null; project: string; onClose: () => void }) {
  const { t } = useT();
  const { can } = useAuth();
  const { busy, error, run, setError } = useAction();
  const { rows: vendors } = useList<Vendor>("/vendors");
  const editing = target && target !== "new" ? target : null;
  const blank = useMemo(() => ({ project, name: "", cost_head: "", execution: "OWN", vendor: "", budget: "", retention_percent: "5", start_date: "", end_date: "", notes: "" }), [project]);
  const [f, setF] = useState(blank);

  useOnOpen(target, (w) => {
    setError("");
    setF(w !== "new" ? {
      project: String(w.project), name: w.name, cost_head: String(w.cost_head), execution: w.execution,
      vendor: w.vendor ? String(w.vendor) : "", budget: String(num(w.budget)), retention_percent: String(num(w.retention_percent)),
      start_date: w.start_date ?? "", end_date: w.end_date ?? "", notes: w.notes,
    } : blank);
  });

  const contractor = f.execution === "CONTRACTOR";
  const valid = f.project && f.name.trim() && f.cost_head && (!contractor || f.vendor);

  async function save() {
    const body = {
      project: Number(f.project), name: f.name.trim(), cost_head: Number(f.cost_head), execution: f.execution,
      vendor: contractor ? Number(f.vendor) : null, budget: f.budget || "0", retention_percent: contractor ? f.retention_percent || "0" : "0",
      start_date: f.start_date || null, end_date: f.end_date || null, notes: f.notes,
    };
    const ok = await run(async () => {
      if (editing) await api.patch(`/work-packages/${editing.id}`, body);
      else await api.post("/work-packages", body);
      await refreshAll();
      return true;
    }, editing ? t("Work package updated", "কাজের অংশ আপডেট হয়েছে") : t("Work package added", "কাজের অংশ যোগ হয়েছে"));
    if (ok) onClose();
  }
  async function remove() {
    if (!editing) return;
    const ok = await run(async () => { await api.del(`/work-packages/${editing.id}`); await refreshAll(); return true; }, t("Work package deleted", "কাজের অংশ মুছে ফেলা হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={!!target} onClose={onClose} size="lg"
      title={editing ? t("Edit work package", "কাজের অংশ সম্পাদনা") : t("Add work package", "কাজের অংশ যোগ করুন")}
      subtitle={t("A slice of the build with its own budget and responsible party.", "নির্মাণের একটি অংশ — নিজস্ব বাজেট ও দায়িত্বপ্রাপ্ত পক্ষসহ।")}
      footer={<>
        {editing && can(EDITORS) && num(editing.billed) === 0 && <Button variant="ghost" className="mr-auto text-rose" loading={busy} onClick={remove}>{t("Delete", "মুছুন")}</Button>}
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!valid} onClick={save}>{t("Save", "সেভ করুন")}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-paper-deep/60 p-1.5">
          {([["OWN", t("Own team", "নিজস্ব টিম"), HardHat], ["CONTRACTOR", t("Contractor", "ঠিকাদার"), Handshake]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setF({ ...f, execution: id })}
              className={cn("flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition", f.execution === id ? "bg-ink text-paper shadow-card" : "text-ink-soft hover:bg-card")}>
              <Icon className="size-4" />{label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Project", "প্রজেক্ট")} required><ProjectSelect value={f.project} onChange={(v) => setF({ ...f, project: v })} /></Field>
          <Field label={t("Name", "নাম")} required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("e.g. Piling works", "যেমন: পাইলিং কাজ")} /></Field>
          <Field label={t("Cost head", "খরচের খাত")} required hint={t("Bills against this package are costed here by default.", "এই অংশের বিল সাধারণত এই খাতে পড়বে।")}>
            <CostHeadSelect value={f.cost_head} onChange={(v) => setF({ ...f, cost_head: v })} only={["DESIGN", "CONSTRUCTION", "CONTINGENCY"]} />
          </Field>
          <Field label={contractor ? t("Contract value", "চুক্তিমূল্য") : t("Planned budget", "পরিকল্পিত বাজেট")} hint={contractor ? t("Bills cannot exceed this amount.", "বিল এই অঙ্ক ছাড়াতে পারবে না।") : undefined}>
            <MoneyInput value={f.budget} onChange={(v) => setF({ ...f, budget: v })} />
          </Field>
          {contractor && (
            <>
              <Field label={t("Contractor", "ঠিকাদার")} required>
                <Select value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })}>
                  <option value="">{t("Choose contractor", "ঠিকাদার বাছুন")}</option>
                  {vendors.filter((v) => v.is_active || String(v.id) === f.vendor).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
              <Field label={t("Retention %", "জামানত %")} hint={t("Held back from every bill until the work is accepted.", "কাজ বুঝে নেওয়া পর্যন্ত প্রতি বিল থেকে আটকে রাখা হয়।")}>
                <Input className="tnum text-right" inputMode="decimal" value={f.retention_percent} onChange={(e) => setF({ ...f, retention_percent: e.target.value.replace(/[^\d.]/g, "") })} />
              </Field>
            </>
          )}
          <Field label={t("Start date", "শুরুর তারিখ")}><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label={t("End date", "শেষের তারিখ")}><Input type="date" value={f.end_date} min={f.start_date || undefined} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
          <Field label={t("Notes", "নোট")} className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
