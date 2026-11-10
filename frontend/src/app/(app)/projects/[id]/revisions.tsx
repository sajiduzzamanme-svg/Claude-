"use client";

import { BadgeCheck, ChevronDown, Info, Plus, Scale, Trash2, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { StatusBadge } from "@/components/forms";
import { Block, Figure, Panel, useOnOpen } from "@/components/project-parts";
import { Avatar, Button, Card, Empty, ErrorNote, Field, Input, Modal, MoneyInput, Select, Skeleton, Textarea, cn, ease, useAction } from "@/components/ui";
import { api, refreshAll, useList } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { num, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { PriceRevision, Project, RevisionLine } from "@/lib/types";

export function RevisionsTab({ project }: { project: Project }) {
  const { t, short } = useT();
  const { can } = useAuth();
  const { rows, loading } = useList<PriceRevision>(`/price-revisions?project=${project.id}`);
  const [create, setCreate] = useState(false);
  const finance = can(ROLES.FINANCE);
  const approved = rows.filter((r) => r.status === "APPROVED").reduce((a, r) => a + num(r.total), 0);

  return (
    <Panel className="space-y-5">
      <Block>
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-sky/30 bg-sky-wash/60 p-4 sm:p-5">
          <div className="flex max-w-3xl gap-3">
            <Info className="mt-0.5 size-5 shrink-0 text-sky" />
            <div className="text-sm leading-relaxed">
              <p className="font-semibold">{t("The original contract price never changes.", "মূল চুক্তির দাম কখনো বদলায় না।")}</p>
              <p className="mt-0.5 text-ink-soft">
                {t(
                  "When all flat owners agree in a meeting to share an extra cost, record it here with the resolution number. Once approved, each owner gets one new installment for their share — shown separately from the contract price on every statement.",
                  "সব ফ্ল্যাট মালিক সভায় বাড়তি খরচ ভাগ করে নিতে রাজি হলে রেজুলেশন নম্বরসহ এখানে লিখুন। অনুমোদনের পর প্রত্যেকের ভাগের জন্য একটি নতুন কিস্তি যোগ হয় — প্রতিটি স্টেটমেন্টে চুক্তিমূল্য থেকে আলাদা দেখায়।",
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Figure label={t("Approved so far", "এ পর্যন্ত অনুমোদিত")}>{short(approved)}</Figure>
            {finance && <Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>{t("New revision", "নতুন সংশোধন")}</Button>}
          </div>
        </div>
      </Block>

      {loading && !rows.length ? <Skeleton className="h-56" /> : rows.length === 0 ? (
        <Block><Card><Empty icon={<Scale />} title={t("No price revisions", "কোনো দাম সংশোধন নেই")} hint={t("Every flat is still at its contract price.", "প্রতিটি ফ্ল্যাট এখনো চুক্তিমূল্যেই আছে।")} /></Card></Block>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => <Block key={r.id}><RevisionCard r={r} /></Block>)}
        </div>
      )}

      <RevisionForm open={create} onClose={() => setCreate(false)} project={project} />
    </Panel>
  );
}

function RevisionCard({ r }: { r: PriceRevision }) {
  const { t, taka, short, date, n } = useT();
  const { can } = useAuth();
  const { busy, error, run } = useAction();
  const [open, setOpen] = useState(r.status === "DRAFT");
  const draft = r.status === "DRAFT";
  const act = (fn: () => Promise<unknown>, ok: string) => run(async () => { await fn(); await refreshAll(); }, ok);

  return (
    <Card className={cn("overflow-hidden", draft && "border-brass/60")}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 p-5">
        <div className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", draft ? "bg-brass-wash text-[#8a6410]" : "bg-leaf-wash text-leaf")}>
          {draft ? <Scale className="size-5" /> : <BadgeCheck className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{r.title}</h3>
            <StatusBadge group="doc" value={r.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-mute">
            {t("Meeting", "সভা")} {date(r.meeting_date)}{r.resolution_ref ? ` · ${t("resolution", "রেজুলেশন")} ${r.resolution_ref}` : ""} · {t("payable by", "পরিশোধের শেষ তারিখ")} {date(r.due_date)}
            {r.approved_by_name ? ` · ${t("approved by", "অনুমোদন করেছেন")} ${r.approved_by_name}` : ""}
          </p>
        </div>
        <div className="text-right">
          <div className="tnum text-2xl font-bold tracking-tight">{short(r.total)}</div>
          <div className="flex items-center justify-end gap-1 text-xs text-mute"><Users className="size-3.5" />{t(`${r.lines.length} owners`, `${n(r.lines.length)} জন মালিক`)}</div>
        </div>
        <button type="button" onClick={() => setOpen((s) => !s)} aria-label={t("Show shares", "ভাগ দেখুন")} className="grid size-9 place-items-center rounded-lg text-mute transition hover:bg-paper-deep hover:text-ink">
          <motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown className="size-4" /></motion.span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
            <div className="border-t border-line bg-paper/50 p-5">
              {r.reason && <p className="mb-4 text-sm text-ink-soft"><span className="font-medium text-ink">{t("Reason:", "কারণ:")}</span> {r.reason}</p>}
              <ShareList lines={r.lines} total={num(r.total)} />
              {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
              {draft && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[13px] text-mute">{t("Nothing is payable until this is approved.", "অনুমোদনের আগে কিছুই পরিশোধযোগ্য নয়।")}</p>
                  <div className="flex gap-2">
                    {can(ROLES.FINANCE) && <Button size="sm" variant="ghost" className="text-rose hover:bg-rose-wash" icon={<Trash2 className="size-3.5" />} loading={busy} onClick={() => act(() => api.del(`/price-revisions/${r.id}`), t("Draft deleted", "খসড়া মুছে ফেলা হয়েছে"))}>{t("Delete draft", "খসড়া মুছুন")}</Button>}
                    {can(ROLES.MANAGERS) && <Button size="sm" icon={<BadgeCheck className="size-4" />} loading={busy} onClick={() => act(() => api.post(`/price-revisions/${r.id}/approve`), t(`Approved — ${taka(r.total)} added to owners' schedules`, `অনুমোদিত — ${taka(r.total)} মালিকদের কিস্তিতে যোগ হয়েছে`))}>{t("Approve and add installments", "অনুমোদন করে কিস্তি যোগ করুন")}</Button>}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function ShareList({ lines, total }: { lines: RevisionLine[]; total: number }) {
  const { t, taka, n, pct } = useT();
  const max = Math.max(...lines.map((l) => num(l.amount)), 1);
  return (
    <ul className="space-y-2">
      {lines.map((l, i) => (
        <motion.li key={l.booking} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }} className="grid items-center gap-x-4 gap-y-1 rounded-xl bg-card px-3.5 py-2.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar name={l.customer_name} size={30} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{l.customer_name}</span>
              <span className="tnum block text-xs text-mute">{t("Flat", "ফ্ল্যাট")} {l.flat_code} · {n(l.flat_size)} {t("sft", "বর্গফুট")} · {l.booking_number}</span>
            </span>
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-paper-deep">
            <motion.span className="block h-full rounded-full bg-brick" initial={{ width: 0 }} animate={{ width: `${(num(l.amount) / max) * 100}%` }} transition={{ duration: 0.6, ease, delay: 0.03 * i }} />
          </span>
          <span className="tnum whitespace-nowrap text-right text-sm"><b className="font-semibold">{taka(l.amount)}</b> <span className="text-xs text-mute">({pct(total ? (num(l.amount) / total) * 100 : 0, 1)})</span></span>
        </motion.li>
      ))}
    </ul>
  );
}

/* ---------- record an agreed extra amount ---------- */
function RevisionForm({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const blank = { title: "", reason: "", meeting_date: today(), resolution_ref: "", due_date: "", total_amount: "", basis: "SQFT" };
  const [f, setF] = useState(blank);
  const [shares, setShares] = useState<RevisionLine[] | null>(null);
  useOnOpen(open, () => { setF(blank); setShares(null); setError(""); });
  const set = (patch: Partial<typeof blank>) => { setF((s) => ({ ...s, ...patch })); if ("total_amount" in patch || "basis" in patch) setShares(null); };

  const complete = f.title.trim() && f.meeting_date && f.due_date && f.resolution_ref.trim() && num(f.total_amount) > 0;
  const preview = () => run(async () => {
    setShares(await api.post<RevisionLine[]>("/price-revisions/preview", { project: project.id, total_amount: f.total_amount, basis: f.basis }));
  });
  const save = async () => {
    const ok = await run(async () => {
      await api.post("/price-revisions", {
        project: project.id, title: f.title.trim(), reason: f.reason, meeting_date: f.meeting_date, due_date: f.due_date,
        resolution_ref: f.resolution_ref.trim(), lines: shares!.map((s) => ({ booking: s.booking, amount: s.amount })),
      });
      await refreshAll();
      return true;
    }, t("Saved as draft, waiting for approval", "খসড়া হিসেবে সেভ হয়েছে, অনুমোদনের অপেক্ষায়"));
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={t("New price revision", "নতুন দাম সংশোধন")}
      subtitle={t("An extra amount that all current flat owners have agreed to share", "বর্তমান সব ফ্ল্যাট মালিক যে বাড়তি টাকা ভাগ করে নিতে রাজি হয়েছেন")}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        {shares
          ? <Button loading={busy} disabled={!complete} onClick={save}>{t("Save as draft", "খসড়া হিসেবে সেভ করুন")}</Button>
          : <Button variant="dark" loading={busy} disabled={!(num(f.total_amount) > 0)} onClick={preview}>{t("Work out each owner's share", "প্রত্যেকের ভাগ হিসাব করুন")}</Button>}
      </>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("What is it for?", "কীসের জন্য?")} required className="sm:col-span-2"><Input autoFocus value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder={t("e.g. Rod and cement price increase", "যেমন: রড ও সিমেন্টের দাম বৃদ্ধি")} /></Field>
          <Field label={t("Meeting date", "সভার তারিখ")} required><Input type="date" max={today()} value={f.meeting_date} onChange={(e) => set({ meeting_date: e.target.value })} /></Field>
          <Field label={t("Resolution / minutes number", "রেজুলেশন / কার্যবিবরণী নম্বর")} required hint={t("Needed before it can be approved", "অনুমোদনের আগে এটি আবশ্যক")}><Input value={f.resolution_ref} onChange={(e) => set({ resolution_ref: e.target.value })} /></Field>
          <Field label={t("Total extra amount", "মোট বাড়তি টাকা")} required><MoneyInput value={f.total_amount} onChange={(v) => set({ total_amount: v })} /></Field>
          <Field label={t("Shared", "ভাগের ভিত্তি")}>
            <Select value={f.basis} onChange={(e) => set({ basis: e.target.value })}>
              <option value="SQFT">{t("By flat size", "ফ্ল্যাটের আয়তন অনুযায়ী")}</option>
              <option value="EQUAL">{t("Equally", "সমানভাবে")}</option>
            </Select>
          </Field>
          <Field label={t("Payable by", "পরিশোধের শেষ তারিখ")} required><Input type="date" min={f.meeting_date} value={f.due_date} onChange={(e) => set({ due_date: e.target.value })} /></Field>
          <Field label={t("Reason / what was decided", "কারণ / কী সিদ্ধান্ত হয়েছে")} className="sm:col-span-2"><Textarea value={f.reason} onChange={(e) => set({ reason: e.target.value })} /></Field>
        </div>
        <AnimatePresence>
          {shares && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border border-line bg-paper/60 p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm font-semibold">{t("Each owner's share", "প্রত্যেক মালিকের ভাগ")}</span>
                <span className="tnum text-sm">{t("Adds up to", "মোট")} <b>{taka(shares.reduce((a, s) => a + num(s.amount), 0), 2)}</b></span>
              </div>
              <ShareList lines={shares} total={num(f.total_amount)} />
            </motion.div>
          )}
        </AnimatePresence>
        {shares && !complete && <p className="text-sm text-[#8a6410]">{t("Fill in the title, resolution number and payable-by date to save.", "সেভ করতে শিরোনাম, রেজুলেশন নম্বর ও শেষ তারিখ দিন।")}</p>}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
