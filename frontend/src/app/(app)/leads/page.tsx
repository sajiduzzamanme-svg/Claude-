"use client";

import { ArrowRight, CalendarClock, CircleCheck, GripVertical, Pencil, Phone, Plus, Search, UserRoundCheck } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { LABELS, ProjectSelect, useLabel } from "@/components/forms";
import { tidy, useOnOpen, useStaff } from "@/components/sales-parts";
import { Guard, Page } from "@/components/shell";
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, MoneyInput, Select, Skeleton, Textarea, cn, ease, rise, useAction, useToast } from "@/components/ui";
import { api, errorText, refreshAll, useList } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { daysFromToday, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Customer, Lead, LeadStage } from "@/lib/types";

const STAGES: LeadStage[] = ["NEW", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "WON", "LOST"];
const STAGE_COLOR: Record<LeadStage, string> = {
  NEW: "var(--color-sky)", CONTACTED: "var(--color-plum)", SITE_VISIT: "var(--color-brass)",
  NEGOTIATION: "var(--color-brick)", WON: "var(--color-leaf)", LOST: "var(--color-mute)",
};
const SOURCES = ["Facebook", "Referral", "Walk-in", "Site signboard", "Newspaper", "Phone call", "Website"];

type Draft = { name: string; phone: string; source: string; project: string; budget: string; assigned_to: string; next_follow_up: string; notes: string; stage: LeadStage };
const emptyDraft = (): Draft => ({ name: "", phone: "", source: "", project: "", budget: "", assigned_to: "", next_follow_up: "", notes: "", stage: "NEW" });

export default function LeadsPage() {
  return <Guard roles={ROLES.SALES_TEAM}><Leads /></Guard>;
}

function Leads() {
  const { t, short, n } = useT();
  const label = useLabel();
  const toast = useToast();
  const { user } = useAuth();
  const { rows, loading, error } = useList<Lead>("/leads");
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState(false);
  const [moving, setMoving] = useState<Record<number, LeadStage>>({});
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [editing, setEditing] = useState<Lead | "new" | null>(null);

  const leads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .map((l) => ({ ...l, stage: moving[l.id] ?? l.stage }))
      .filter((l) => (!mine || l.assigned_to === user?.id) && (!q || `${l.name} ${l.phone} ${l.source} ${l.project_code ?? ""}`.toLowerCase().includes(q)));
  }, [rows, moving, search, mine, user?.id]);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s, [] as Lead[]])) as Record<LeadStage, Lead[]>;
    for (const l of leads) map[l.stage].push(l);
    return map;
  }, [leads]);
  const open = leads.filter((l) => l.stage !== "WON" && l.stage !== "LOST");
  const maxCount = Math.max(...STAGES.map((s) => byStage[s].length), 1);

  async function move(lead: Lead, stage: LeadStage) {
    if (lead.stage === stage) return;
    setMoving((m) => ({ ...m, [lead.id]: stage }));
    try {
      await api.patch(`/leads/${lead.id}`, { stage });
      await refreshAll();
      toast.ok(t(`${lead.name} moved to ${label("lead", stage)}`, `${lead.name} → ${label("lead", stage)}`));
    } catch (e) {
      toast.err(errorText(e));
    } finally {
      setMoving((m) => {
        const rest = { ...m };
        delete rest[lead.id];
        return rest;
      });
    }
  }

  return (
    <Page wide
      eyebrow={t("Sales pipeline", "বিক্রয় পাইপলাইন")}
      title={t("Leads", "লিড")}
      subtitle={t("Every enquiry from first call to booking. Drag a card to the next stage as it moves forward.", "প্রথম ফোন থেকে বুকিং পর্যন্ত প্রতিটি আগ্রহী ক্রেতা। এগোলে কার্ড টেনে পরের ধাপে নিন।")}
      actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>{t("New lead", "নতুন লিড")}</Button>}
    >
      {/* ---------- pipeline ribbon ---------- */}
      <motion.div variants={rise}>
        <Card className="overflow-hidden p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-mute">{t("Open pipeline", "চলমান পাইপলাইন")}</p>
              <p className="mt-1 text-3xl font-bold tracking-tight"><span className="tnum">{short(open.reduce((a, l) => a + num(l.budget), 0))}</span>
                <span className="ml-2 text-base font-medium text-mute">{t(`across ${open.length} people`, `${n(open.length)} জন আগ্রহী`)}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
                <Input className="pl-9" placeholder={t("Search name, phone, source", "নাম, ফোন, সোর্স খুঁজুন")} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button onClick={() => setMine((m) => !m)} className={cn("h-10 rounded-[10px] border px-3 text-sm font-medium transition", mine ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink-soft hover:border-ink")}>
                {t("My leads", "আমার লিড")}
              </button>
            </div>
          </div>
          <div className="scroll-thin mt-5 flex gap-1 overflow-x-auto pb-1">
            {STAGES.map((s, i) => {
              const list = byStage[s];
              const first = i === 0;
              return (
                <motion.div key={s} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease, delay: 0.08 * i }}
                  className="relative min-w-[150px] flex-1 py-3 pl-7 pr-5 text-paper"
                  style={{
                    background: STAGE_COLOR[s],
                    clipPath: first
                      ? "polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)"
                      : "polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 16px 50%)",
                    borderRadius: first ? "12px 0 0 12px" : undefined,
                  }}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">{label("lead", s)}</div>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <span className="tnum text-2xl font-bold leading-none">{n(list.length)}</span>
                    <span className="tnum text-xs opacity-80">{short(list.reduce((a, l) => a + num(l.budget), 0))}</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/25">
                    <motion.div className="h-full rounded-full bg-white" initial={{ width: 0 }} animate={{ width: `${(list.length / maxCount) * 100}%` }} transition={{ duration: 0.8, ease, delay: 0.3 + 0.08 * i }} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* ---------- board ---------- */}
      {error ? <Card className="mt-5"><Empty title={error.message} /></Card> : (
        <LayoutGroup>
          <motion.div variants={rise} className="scroll-thin mt-5 flex snap-x gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => {
              const list = byStage[stage];
              const hot = over === stage && dragId !== null;
              return (
                <div key={stage}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== stage) setOver(stage); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = Number(e.dataTransfer.getData("text/plain"));
                    const lead = leads.find((l) => l.id === id);
                    setOver(null);
                    setDragId(null);
                    if (lead) void move(lead, stage);
                  }}
                  className={cn("flex w-[280px] shrink-0 snap-start flex-col rounded-2xl border bg-paper-deep/50 transition-colors duration-200 xl:w-auto xl:min-w-[230px] xl:flex-1", hot ? "border-ink bg-brass-wash/70" : "border-line")}>
                  <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
                    <div className="flex items-center gap-2">
                      <i className="size-2.5 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
                      <h3 className="text-sm font-semibold">{label("lead", stage)}</h3>
                      <span className="tnum rounded-full bg-card px-2 text-xs font-semibold text-ink-soft">{n(list.length)}</span>
                    </div>
                    <span className="tnum text-xs font-medium text-mute">{short(list.reduce((a, l) => a + num(l.budget), 0))}</span>
                  </div>
                  <div className="flex min-h-[140px] flex-1 flex-col gap-2.5 p-2.5 pt-1">
                    {loading && [0, 1].map((i) => <Skeleton key={i} className="h-28" />)}
                    {list.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} dragging={dragId === lead.id} busy={lead.id in moving}
                        onDragStart={() => setDragId(lead.id)} onDragEnd={() => { setDragId(null); setOver(null); }}
                        onMove={(s) => move(lead, s)} onEdit={() => setEditing(rows.find((r) => r.id === lead.id) ?? lead)} />
                    ))}
                    {!loading && list.length === 0 && (
                      <div className={cn("grid flex-1 place-items-center rounded-xl border border-dashed px-3 py-6 text-center text-xs", hot ? "border-ink text-ink" : "border-line text-mute")}>
                        {hot ? t("Drop here", "এখানে ছাড়ুন") : t("No one at this stage", "এই ধাপে কেউ নেই")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </motion.div>
        </LayoutGroup>
      )}

      <LeadModal lead={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function LeadCard({ lead, dragging, busy, onDragStart, onDragEnd, onMove, onEdit }: {
  lead: Lead; dragging: boolean; busy: boolean; onDragStart: () => void; onDragEnd: () => void; onMove: (s: LeadStage) => void; onEdit: () => void;
}) {
  const { t, short, date, n } = useT();
  const label = useLabel();
  const closed = lead.stage === "WON" || lead.stage === "LOST";
  const days = daysFromToday(lead.next_follow_up);
  const late = !closed && days !== null && days < 0;
  const dueToday = !closed && days === 0;
  return (
    <motion.div layout layoutId={`lead-${lead.id}`} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: busy ? 0.6 : 1, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>
      <div draggable onDragEnd={onDragEnd}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", String(lead.id));
          e.dataTransfer.effectAllowed = "move";
          // Restyling the dragged element inside dragstart makes Chrome abort the drag, so wait a tick.
          setTimeout(onDragStart, 0);
        }}
        className={cn("group cursor-grab rounded-xl border border-line bg-card p-3 shadow-card transition-[box-shadow,opacity] duration-200 hover:shadow-lift active:cursor-grabbing", dragging && "opacity-40")}
        style={{ borderLeft: `3px solid ${STAGE_COLOR[lead.stage]}` }}>
        <div className="flex items-start justify-between gap-2">
          <button onClick={onEdit} className="min-w-0 text-left">
            <span className="line-clamp-2 text-sm font-semibold leading-snug hover:underline">{lead.name}</span>
            <span className="tnum block text-xs text-mute">{lead.phone}</span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5 text-mute">
            <a href={`tel:${lead.phone}`} title={t("Call", "ফোন করুন")} aria-label={t("Call", "ফোন করুন")} className="grid size-7 place-items-center rounded-md transition hover:bg-leaf-wash hover:text-leaf"><Phone className="size-3.5" /></a>
            <button onClick={onEdit} title={t("Edit", "সম্পাদনা")} aria-label={t("Edit", "সম্পাদনা")} className="grid size-7 place-items-center rounded-md transition hover:bg-paper-deep hover:text-ink"><Pencil className="size-3.5" /></button>
            <GripVertical className="size-4 opacity-30 transition group-hover:opacity-80" />
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {lead.project_code && <Badge tone="ink">{lead.project_code}</Badge>}
          {num(lead.budget) > 0 && <Badge tone="brass">{short(lead.budget)}</Badge>}
          {lead.source && <span className="truncate text-[11.5px] text-mute">{lead.source}</span>}
        </div>
        {lead.next_follow_up && !closed && (
          <div className={cn("mt-2.5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium", late ? "bg-rose-wash text-rose" : dueToday ? "bg-brass-wash text-[#8a6410]" : "bg-paper-deep text-ink-soft")}>
            <CalendarClock className="size-3.5 shrink-0" />
            {late ? t(`Follow-up ${-days!} days late`, `ফলো-আপ ${n(-days!)} দিন পেরিয়েছে`) : dueToday ? t("Follow up today", "আজ ফলো-আপ") : `${t("Follow up", "ফলো-আপ")} ${date(lead.next_follow_up)}`}
          </div>
        )}
        {lead.customer && <div className="mt-2.5 flex items-center gap-1.5 text-[12px] font-medium text-leaf"><UserRoundCheck className="size-3.5" />{t("Customer record created", "ক্রেতা হিসেবে যুক্ত")}</div>}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/70 pt-2.5">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-soft">
            {lead.assigned_to_name ? <><Avatar name={lead.assigned_to_name} size={20} /><span className="truncate">{lead.assigned_to_name.split(" ")[0]}</span></> : <span className="text-mute">{t("Unassigned", "কেউ দায়িত্বে নেই")}</span>}
          </span>
          <select value={lead.stage} disabled={busy} onChange={(e) => onMove(e.target.value as LeadStage)} aria-label={t("Move to stage", "ধাপ বদলান")}
            className="chevron h-7 max-w-[120px] appearance-none rounded-md border border-line bg-paper py-0 pl-2 pr-7 text-[12px] font-medium text-ink-soft outline-none transition hover:border-ink focus:border-ink">
            {STAGES.map((s) => <option key={s} value={s}>{label("lead", s)}</option>)}
          </select>
        </div>
      </div>
    </motion.div>
  );
}

function LeadModal({ lead, onClose }: { lead: Lead | "new" | null; onClose: () => void }) {
  const { t } = useT();
  const { rows: staff } = useStaff();
  const { user } = useAuth();
  const { busy, error, run, setError } = useAction();
  const [d, setD] = useState<Draft>(emptyDraft());
  const [converted, setConverted] = useState<Customer | null>(null);
  const existing = lead && lead !== "new" ? lead : null;

  useOnOpen(!!lead, () => {
    setError("");
    setConverted(null);
    setD(existing
      ? { name: existing.name, phone: existing.phone, source: existing.source, project: existing.project ? String(existing.project) : "", budget: tidy(existing.budget), assigned_to: existing.assigned_to ? String(existing.assigned_to) : "", next_follow_up: existing.next_follow_up ?? "", notes: existing.notes, stage: existing.stage }
      : { ...emptyDraft(), assigned_to: user ? String(user.id) : "" });
  }, existing?.id ?? "new");

  const payload = () => ({
    name: d.name.trim(), phone: d.phone.trim(), source: d.source.trim(), project: d.project ? Number(d.project) : null, budget: d.budget || "0",
    assigned_to: d.assigned_to ? Number(d.assigned_to) : null, next_follow_up: d.next_follow_up || null, notes: d.notes, stage: d.stage,
  });

  async function save() {
    const ok = await run(async () => {
      if (existing) await api.patch(`/leads/${existing.id}`, payload());
      else await api.post("/leads", payload());
      await refreshAll();
      return true;
    }, existing ? t("Lead updated", "লিড হালনাগাদ হয়েছে") : t("Lead added", "লিড যোগ হয়েছে"));
    if (ok) onClose();
  }

  async function convert() {
    if (!existing) return;
    const customer = await run(async () => {
      await api.patch(`/leads/${existing.id}`, payload());
      const c = await api.post<Customer>(`/leads/${existing.id}/convert`);
      await refreshAll();
      return c;
    }, t("Customer record created", "ক্রেতা হিসেবে যুক্ত হয়েছে"));
    if (customer) setConverted(customer);
  }

  const customerId = converted?.id ?? existing?.customer ?? null;

  return (
    <Modal open={!!lead} onClose={onClose} size="lg"
      title={existing ? existing.name : t("New lead", "নতুন লিড")}
      subtitle={existing ? t("Update details, or turn this person into a customer.", "তথ্য হালনাগাদ করুন, অথবা ক্রেতা হিসেবে যুক্ত করুন।") : t("Someone asked about a flat — note it before it is forgotten.", "কেউ ফ্ল্যাটের খোঁজ নিয়েছেন — ভুলে যাওয়ার আগে লিখে রাখুন।")}
      footer={<>
        {existing && !customerId && existing.stage !== "LOST" && (
          <Button variant="outline" className="mr-auto" loading={busy} icon={<UserRoundCheck className="size-4" />} onClick={convert} disabled={!d.name.trim() || !d.phone.trim()}>{t("Convert to customer", "ক্রেতায় রূপান্তর")}</Button>
        )}
        <Button variant="ghost" onClick={onClose}>{t("Close", "বন্ধ")}</Button>
        <Button loading={busy} disabled={!d.name.trim() || !d.phone.trim()} onClick={save}>{existing ? t("Save changes", "পরিবর্তন সেভ করুন") : t("Add lead", "লিড যোগ করুন")}</Button>
      </>}>
      <div className="space-y-4">
        {customerId && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-leaf/30 bg-leaf-wash px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-leaf"><CircleCheck className="size-4" />{t("This lead is now a customer.", "এই লিড এখন একজন ক্রেতা।")}</span>
            <Link href={`/bookings/new?customer=${customerId}`}><Button size="sm" variant="dark" icon={<ArrowRight className="order-last size-4" />}>{t("Start a booking", "বুকিং শুরু করুন")}</Button></Link>
          </motion.div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Name", "নাম")} required><Input autoFocus={!existing} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label={t("Phone", "ফোন")} required><Input inputMode="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="01XXXXXXXXX" /></Field>
          <Field label={t("Interested in", "যে প্রজেক্টে আগ্রহ")}><ProjectSelect value={d.project} onChange={(v) => setD({ ...d, project: v })} all={t("Not decided", "ঠিক হয়নি")} /></Field>
          <Field label={t("Budget", "বাজেট")}><MoneyInput value={d.budget} onChange={(v) => setD({ ...d, budget: v })} /></Field>
          <Field label={t("How did they hear of us?", "কোথা থেকে জেনেছেন?")}>
            <Input list="lead-sources" value={d.source} onChange={(e) => setD({ ...d, source: e.target.value })} placeholder="Facebook, Referral…" />
            <datalist id="lead-sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label={t("Assigned to", "দায়িত্বে")}>
            <Select value={d.assigned_to} onChange={(e) => setD({ ...d, assigned_to: e.target.value })}>
              <option value="">{t("Nobody yet", "এখনো কেউ না")}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
            </Select>
          </Field>
          <Field label={t("Next follow-up", "পরবর্তী ফলো-আপ")}><Input type="date" value={d.next_follow_up} onChange={(e) => setD({ ...d, next_follow_up: e.target.value })} /></Field>
          <Field label={t("Stage", "ধাপ")}>
            <Select value={d.stage} onChange={(e) => setD({ ...d, stage: e.target.value as LeadStage })}>
              {STAGES.map((s) => <option key={s} value={s}>{t(LABELS.lead[s].en, LABELS.lead[s].bn)}</option>)}
            </Select>
          </Field>
          <Field label={t("Notes", "নোট")} className="sm:col-span-2"><Textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder={t("What they want, what was promised, objections…", "কী চান, কী বলা হয়েছে, আপত্তি…")} /></Field>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
