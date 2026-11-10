"use client";

import { CircleCheck, NotebookPen, Undo2, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Donut, Legend } from "@/components/charts";
import { CATEGORIES, CashSelect, CostHeadSelect, ProjectSelect, VoidModal, useCostHeads } from "@/components/forms";
import { Guard, Page } from "@/components/shell";
import { Badge, Button, Card, CountUp, Empty, ErrorNote, Field, Input, MoneyInput, SectionTitle, Select, Skeleton, cn, ease, rise, useAction } from "@/components/ui";
import { api, qs, refreshAll, useList } from "@/lib/api";
import { ROLES } from "@/lib/auth";
import { num, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { CostCategory, Expense } from "@/lib/types";

const PROJECT_COST: CostCategory[] = ["LAND", "DESIGN", "CONSTRUCTION", "CONTINGENCY"];
const color = (c: CostCategory) => CATEGORIES.find((x) => x.id === c)?.color ?? "var(--color-mute)";

export default function ExpensesPage() {
  return <Guard roles={ROLES.FINANCE}><Expenses /></Guard>;
}

function Expenses() {
  const { t, taka, short, date, month, n } = useT();
  const [filter, setFilter] = useState({ project: "", category: "", from: "", to: "" });
  const { rows, loading } = useList<Expense>(`/expenses${qs({ page_size: 200, project: filter.project, cost_head__category: filter.category, date__gte: filter.from, date__lte: filter.to })}`);
  const [voiding, setVoiding] = useState<Expense | null>(null);

  const posted = rows.filter((e) => e.status === "POSTED");
  const total = posted.reduce((a, e) => a + num(e.amount), 0);
  const segments = CATEGORIES.map((c) => ({ label: t(c.en, c.bn), color: c.color, value: posted.filter((e) => e.category === c.id).reduce((a, e) => a + num(e.amount), 0) })).filter((s) => s.value > 0);

  // Group the list by month so it reads like pages of a cash book.
  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of rows) map.set(e.date.slice(0, 7), [...(map.get(e.date.slice(0, 7)) ?? []), e]);
    return [...map.entries()];
  }, [rows]);

  return (
    <Page
      eyebrow={<><Wallet className="size-3.5" />{t("Cash book", "ক্যাশ বুক")}</>}
      title={t("Expenses", "খরচ")}
      subtitle={t("Money paid out directly — site petty cash, fees, wages, office costs. Vendor invoices belong under Procurement.", "সরাসরি পরিশোধ — সাইটের খুচরা খরচ, ফি, মজুরি, অফিস খরচ। সরবরাহকারীর বিল ক্রয় ও বিল অংশে।")}
    >
      <div className="grid gap-5 xl:grid-cols-[400px_1fr] xl:items-start">
        <motion.div variants={rise} className="min-w-0 xl:sticky xl:top-6"><QuickEntry /></motion.div>

        <div className="min-w-0 space-y-5">
          <motion.div variants={rise}>
            <Card className="p-5 sm:p-6">
              <SectionTitle hint={t("Posted expenses in the current view", "বর্তমান ফিল্টারে পোস্টেড খরচ")}>{t("Where the money went", "টাকা কোথায় গেল")}</SectionTitle>
              {loading ? <Skeleton className="h-44" /> : segments.length === 0 ? <Empty title={t("Nothing to chart yet", "দেখানোর মতো কিছু নেই")} /> : (
                <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
                  <Donut segments={segments} size={176} thickness={24}>
                    <div><CountUp value={total} format={short} className="text-xl font-bold" /><div className="text-[11px] text-mute">{n(posted.length)} {t("entries", "এন্ট্রি")}</div></div>
                  </Donut>
                  <Legend items={segments} fmt={(v) => taka(v)} className="min-w-64 flex-1" />
                </div>
              )}
            </Card>
          </motion.div>

          <motion.div variants={rise}>
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-end gap-3 border-b border-line p-4 sm:p-5">
                <div className="w-48"><ProjectSelect value={filter.project} onChange={(v) => setFilter({ ...filter, project: v })} all={t("All projects", "সব প্রজেক্ট")} /></div>
                <div className="w-48">
                  <Select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })}>
                    <option value="">{t("All categories", "সব ধরন")}</option>
                    {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(c.en, c.bn)}</option>)}
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm text-mute">{t("From", "থেকে")}<Input type="date" className="w-40" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></label>
                <label className="flex items-center gap-2 text-sm text-mute">{t("To", "পর্যন্ত")}<Input type="date" className="w-40" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} /></label>
                {(filter.project || filter.category || filter.from || filter.to) && <Button size="sm" variant="ghost" onClick={() => setFilter({ project: "", category: "", from: "", to: "" })}>{t("Clear", "মুছুন")}</Button>}
              </div>
              {loading ? <div className="space-y-2 p-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div> : rows.length === 0 ? (
                <Empty icon={<NotebookPen />} title={t("No expenses found", "কোনো খরচ পাওয়া যায়নি")} hint={t("Record one with the pad on the left.", "বাঁ দিকের প্যাড থেকে একটি রেকর্ড করুন।")} />
              ) : (
                <div>
                  {groups.map(([ym, items]) => (
                    <section key={ym}>
                      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper/90 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute backdrop-blur">
                        <span>{month(`${ym}-01`, true)}</span>
                        <span className="tnum">{taka(items.filter((e) => e.status === "POSTED").reduce((a, e) => a + num(e.amount), 0))}</span>
                      </header>
                      <ul>
                        <AnimatePresence initial={false}>
                          {items.map((e, i) => {
                            const voided = e.status === "VOIDED";
                            return (
                              <motion.li key={e.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease, delay: Math.min(i, 12) * 0.02 }}
                                className={cn("group flex items-center gap-3 border-b border-line/60 px-4 py-3 transition hover:bg-paper-deep/50 sm:px-5", voided && "opacity-55")}>
                                <span className="tnum grid w-11 shrink-0 place-items-center rounded-lg bg-paper-deep py-1 text-center leading-tight">
                                  <b className="text-sm">{n(Number(e.date.slice(8, 10)))}</b><span className="text-[10px] uppercase text-mute">{month(e.date)}</span>
                                </span>
                                <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: color(e.category) }} />
                                <span className="min-w-0 flex-1">
                                  <span className={cn("block truncate text-sm font-medium", voided && "line-through")}>{e.description}</span>
                                  <span className="block truncate text-xs text-mute">
                                    {t(e.cost_head_name, e.cost_head_name_bn || e.cost_head_name)} · {e.project_code ?? t("Office", "অফিস")}{e.payee ? ` · ${e.payee}` : ""} · {e.paid_from_name}
                                    {voided && e.void_reason && <span className="text-rose"> · {e.void_reason}</span>}
                                  </span>
                                </span>
                                {voided && <Badge tone="rose">{t("Voided", "বাতিল")}</Badge>}
                                <span className={cn("tnum whitespace-nowrap text-sm font-semibold", voided && "line-through")} title={date(e.date)}>{taka(e.amount)}</span>
                                {!voided && (
                                  <button onClick={() => setVoiding(e)} title={t("Void", "বাতিল")} aria-label={t("Void expense", "খরচ বাতিল")} className="grid size-8 shrink-0 place-items-center rounded-lg text-mute opacity-60 transition hover:bg-rose-wash hover:text-rose group-hover:opacity-100">
                                    <Undo2 className="size-4" />
                                  </button>
                                )}
                              </motion.li>
                            );
                          })}
                        </AnimatePresence>
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>
        </div>
      </div>

      <VoidModal open={!!voiding} onClose={() => setVoiding(null)} title={t(`Void ${voiding?.number ?? ""}`, `${voiding?.number ?? ""} বাতিল`)}
        onConfirm={(reason) => api.post(`/expenses/${voiding!.id}/void`, { reason })} />
    </Page>
  );
}

/** A voucher pad: fill it in, tear it off, the next one is ready. */
function QuickEntry() {
  const { t, taka } = useT();
  const { rows: heads } = useCostHeads();
  const { busy, error, run } = useAction();
  const [f, setF] = useState({ date: today(), amount: "", cost_head: "", project: "", paid_from: "", payee: "", description: "" });
  const [last, setLast] = useState<Expense | null>(null);

  const head = heads.find((h) => String(h.id) === f.cost_head);
  const needsProject = !!head && PROJECT_COST.includes(head.category);
  const valid = num(f.amount) > 0 && f.cost_head && f.paid_from && f.description.trim() && (!needsProject || f.project);

  async function save() {
    const out = await run(async () => {
      const e = await api.post<Expense>("/expenses", {
        project: f.project ? Number(f.project) : null, cost_head: Number(f.cost_head), date: f.date, amount: f.amount,
        paid_from: Number(f.paid_from), payee: f.payee, description: f.description.trim(),
      });
      await refreshAll();
      return e;
    }, t("Expense recorded", "খরচ রেকর্ড হয়েছে"));
    if (out) {
      setLast(out);
      setF((s) => ({ ...s, amount: "", payee: "", description: "" }));
    }
  }

  return (
    <div className="relative">
      {/* perforated top edge */}
      <div className="mx-5 flex justify-between">{[...Array(14)].map((_, i) => <span key={i} className="-mb-1.5 size-3 rounded-full border border-line bg-paper" />)}</div>
      <Card className="border-dashed p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-ink text-brass"><NotebookPen className="size-5" /></span>
          <div><h2 className="font-semibold leading-tight">{t("Payment voucher", "পেমেন্ট ভাউচার")}</h2><p className="text-xs text-mute">{t("Quick entry — fill, save, next", "দ্রুত এন্ট্রি — লিখুন, সেভ করুন, পরেরটি")}</p></div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (valid && !busy) void save(); }} className="space-y-3.5">
          <div className="grid grid-cols-[1fr_148px] gap-3">
            <Field label={t("Amount", "টাকা")} required><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} className="h-12 text-xl" /></Field>
            <Field label={t("Date", "তারিখ")} required><Input type="date" className="h-12 text-[13px]" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          </div>
          <Field label={t("Spent on", "যে খাতে")} required><CostHeadSelect value={f.cost_head} onChange={(v) => setF({ ...f, cost_head: v })} /></Field>
          <Field label={t("Project", "প্রজেক্ট")} required={needsProject}
            hint={needsProject ? t("This is a project cost, so it needs a project.", "এটি প্রজেক্টের খরচ, তাই প্রজেক্ট বাছতে হবে।") : t("Leave empty for general office costs.", "সাধারণ অফিস খরচ হলে ফাঁকা রাখুন।")}>
            <ProjectSelect value={f.project} onChange={(v) => setF({ ...f, project: v })} all={t("No project (office)", "প্রজেক্ট নয় (অফিস)")} />
          </Field>
          <Field label={t("What for", "বিবরণ")} required><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={t("e.g. Site labour weekly wages", "যেমন: সাইট লেবারের সাপ্তাহিক মজুরি")} /></Field>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <Field label={t("Paid to", "যাকে দেওয়া হলো")}><Input value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} /></Field>
            <Field label={t("Paid from", "যে হিসাব থেকে")} required><CashSelect value={f.paid_from} onChange={(v) => setF((s) => ({ ...s, paid_from: v }))} /></Field>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!valid}>{t("Record expense", "খরচ রেকর্ড করুন")}</Button>
        </form>

        <AnimatePresence>
          {last && (
            <motion.div key={last.id} initial={{ opacity: 0, y: 10, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease }}
              className="mt-4 flex items-center gap-3 rounded-xl border border-leaf/30 bg-leaf-wash px-3.5 py-2.5 text-[13px]">
              <CircleCheck className="size-5 shrink-0 text-leaf" />
              <span className="min-w-0 flex-1 truncate"><b className="tnum">{last.number}</b> · {last.description}</span>
              <span className="tnum font-semibold">{taka(last.amount)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
