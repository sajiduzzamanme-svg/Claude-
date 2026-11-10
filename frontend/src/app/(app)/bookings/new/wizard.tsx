"use client";

import { ArrowLeft, ArrowRight, Check, CircleCheck, Equal, Lock, Plus, Search, Trash2, TriangleAlert, UserPlus, WandSparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatGrid, StatusLegend } from "@/components/building";
import { useProjects } from "@/components/forms";
import { CustomerFields, emptyCustomer, fromPaisa, paisa, tidy, useDebounced, useStaff, type CustomerDraft } from "@/components/sales-parts";
import { Guard, Page } from "@/components/shell";
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Field, Input, MoneyInput, Select, Skeleton, Spinner, Textarea, cn, ease, rise, useToast } from "@/components/ui";
import { ApiError, api, errorText, qs, refreshAll, useApi, useList } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { cleanMoney, num, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { BookingDetail, Customer, Flat, Project } from "@/lib/types";

type Row = { kind: string; title: string; due_date: string; amount: string };
type Plan = { booking_money: string; down_payment: string; down_payment_date: string; installment_count: string; first_installment_date: string; interval_months: string; handover_amount: string; round_to: string };

export default function Wizard() {
  return <Guard roles={ROLES.SALES_TEAM}><NewBooking /></Guard>;
}

function NewBooking() {
  const { t, taka, short, date, n } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();
  const { rows: projects, loading: projectsLoading } = useProjects();
  const { rows: staff } = useStaff();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [flat, setFlat] = useState<Flat | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [price, setPrice] = useState({ land: "", construction: "", other: "", discount: "" });
  const [meta, setMeta] = useState({ booking_date: today(), sales_person: "", expected_handover: "", notes: "" });
  const [plan, setPlan] = useState<Plan>({ booking_money: "", down_payment: "", down_payment_date: "", installment_count: "24", first_installment_date: "", interval_months: "1", handover_amount: "", round_to: "1000" });
  const [schedule, setSchedule] = useState<Row[]>([]);
  const [building, setBuilding] = useState(false);
  const [planError, setPlanError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ text: string; code?: string } | null>(null);
  const autoBuilt = useRef<number | null>(null);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const { rows: flats, loading: flatsLoading } = useList<Flat>(projectId ? `/flats?project=${projectId}&page_size=500` : null);

  // ?customer= (from a lead or a customer card) and ?project= preselect.
  const presetCustomer = params.get("customer");
  const presetProject = params.get("project");
  const { data: preset } = useApi<Customer>(presetCustomer && /^\d+$/.test(presetCustomer) ? `/customers/${presetCustomer}` : null);
  // Defaults that depend on loaded data are applied once, while rendering.
  const [applied, setApplied] = useState({ customer: false, project: false, seller: false });
  if (preset && !applied.customer) {
    setApplied((a) => ({ ...a, customer: true }));
    setCustomer(preset);
  }
  if (!applied.project && projects.length) {
    setApplied((a) => ({ ...a, project: true }));
    const open = projects.filter((p) => p.sales_open);
    const wanted = open.find((p) => String(p.id) === presetProject) ?? (open.length === 1 ? open[0] : null);
    if (wanted) setProjectId(wanted.id);
  }
  if (!applied.seller && user && staff.length) {
    setApplied((a) => ({ ...a, seller: true }));
    if (staff.some((s) => s.id === user.id)) setMeta((m) => ({ ...m, sales_person: String(user.id) }));
  }

  function chooseProject(p: Project) {
    if (!p.sales_open || p.id === projectId) return;
    setProjectId(p.id);
    setFlat(null);
    setSchedule([]);
  }
  function chooseFlat(f: Flat) {
    setFlat(f);
    setPrice({ land: tidy(f.land_price), construction: tidy(f.construction_price), other: tidy(f.other_charges), discount: "" });
    const total = paisa(f.list_price) / 100;
    setPlan((p) => ({ ...p, booking_money: String(total > 1000000 ? 500000 : Math.round((total * 0.1) / 1000) * 1000), down_payment: "", handover_amount: "" }));
    setMeta((m) => ({ ...m, expected_handover: project?.expected_handover ?? "" }));
    setSchedule([]);
    setPlanError("");
    autoBuilt.current = null;
  }

  const subtotal = paisa(price.land) + paisa(price.construction) + paisa(price.other);
  const total = subtotal - paisa(price.discount);
  const scheduled = schedule.reduce((a, r) => a + paisa(r.amount), 0);
  const diff = total - scheduled;
  const rowsValid = schedule.length > 0 && schedule.every((r) => r.due_date && paisa(r.amount) > 0);
  const priceValid = total > 0 && paisa(price.discount) < subtotal;
  const canSave = !!flat && !!customer && priceValid && rowsValid && diff === 0 && !!meta.booking_date;

  const build = useCallback(async () => {
    if (total <= 0) return;
    setBuilding(true);
    setPlanError("");
    try {
      const rows = await api.post<Row[]>("/bookings/preview-schedule", {
        total: fromPaisa(total), booking_date: meta.booking_date,
        booking_money: plan.booking_money || "0", down_payment: plan.down_payment || "0",
        down_payment_date: plan.down_payment_date || null, installment_count: Number(plan.installment_count || 0),
        first_installment_date: plan.first_installment_date || null, interval_months: Math.max(1, Number(plan.interval_months || 1)),
        handover_amount: plan.handover_amount || "0", handover_date: null, round_to: plan.round_to || "0",
      });
      setSchedule(rows.map((r) => ({ ...r, amount: tidy(r.amount) })));
    } catch (e) {
      setPlanError(errorText(e));
    } finally {
      setBuilding(false);
    }
  }, [total, meta.booking_date, plan]);

  // First time on the plan step: draft a schedule so the user starts from something sensible.
  useEffect(() => {
    if (step === 2 && flat && schedule.length === 0 && autoBuilt.current !== flat.id) {
      autoBuilt.current = flat.id;
      void build();
    }
  }, [step, flat, schedule.length, build]);

  function go(to: number) {
    setDir(to > step ? 1 : -1);
    setStep(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!flat || !customer) return;
    setSaving(true);
    setSaveError(null);
    try {
      const booking = await api.post<BookingDetail>("/bookings", {
        flat: flat.id, customer: customer.id, booking_date: meta.booking_date,
        land_price: fromPaisa(paisa(price.land)), construction_price: fromPaisa(paisa(price.construction)),
        other_charges: fromPaisa(paisa(price.other)), discount: fromPaisa(paisa(price.discount)),
        sales_person: meta.sales_person ? Number(meta.sales_person) : null, expected_handover: meta.expected_handover || null, notes: meta.notes,
        schedule: schedule.map((r) => ({ kind: r.kind, title: r.title, due_date: r.due_date, amount: fromPaisa(paisa(r.amount)) })),
      });
      await refreshAll();
      toast.ok(t(`Booking ${booking.number} saved`, `বুকিং ${booking.number} সেভ হয়েছে`));
      router.push(`/bookings/${booking.id}`);
    } catch (e) {
      setSaveError({ text: errorText(e), code: e instanceof ApiError ? e.code : undefined });
      setSaving(false);
    }
  }

  const steps = [
    { en: "Flat", bn: "ফ্ল্যাট", done: !!flat },
    { en: "Customer", bn: "ক্রেতা", done: !!customer },
    { en: "Price & plan", bn: "দাম ও কিস্তি", done: canSave },
  ];
  const canNext = step === 0 ? !!flat : step === 1 ? !!customer : false;

  return (
    <Page
      eyebrow={<Link href="/bookings" className="flex items-center gap-1.5 hover:underline"><ArrowLeft className="size-3.5" />{t("Bookings", "বুকিং")}</Link>}
      title={t("New booking", "নতুন বুকিং")}
      subtitle={t("Three steps: choose the flat, choose the buyer, agree the price and the payment plan.", "তিন ধাপ: ফ্ল্যাট বাছুন, ক্রেতা বাছুন, দাম ও কিস্তির পরিকল্পনা ঠিক করুন।")}
    >
      {/* ---------- stepper ---------- */}
      <motion.div variants={rise} className="mb-6">
        <ol className="relative grid grid-cols-3">
          <div className="absolute left-[16.66%] right-[16.66%] top-5 h-0.5 bg-line" />
          <motion.div className="absolute left-[16.66%] top-5 h-0.5 bg-brick" initial={false} animate={{ width: `${(step / 2) * 66.67}%` }} transition={{ duration: 0.5, ease }} />
          {steps.map((s, i) => {
            const reachable = i <= step || (i === 1 && !!flat) || (i === 2 && !!flat && !!customer);
            return (
              <li key={s.en} className="relative z-10 flex flex-col items-center gap-2">
                <button type="button" disabled={!reachable} onClick={() => go(i)}
                  className={cn("grid size-10 place-items-center rounded-full border-2 text-sm font-bold transition-colors duration-300",
                    i === step ? "border-brick bg-brick text-white shadow-[0_8px_20px_-8px_var(--color-brick)]" : s.done && i < step ? "border-leaf bg-leaf text-white" : "border-line bg-card text-mute", !reachable && "cursor-not-allowed")}>
                  {s.done && i < step ? <Check className="size-5" /> : n(i + 1)}
                </button>
                <span className={cn("text-[13px] font-medium", i === step ? "text-ink" : "text-mute")}>{t(s.en, s.bn)}</span>
              </li>
            );
          })}
        </ol>
      </motion.div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir}
              initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -40 }} transition={{ duration: 0.3, ease }}>
              {step === 0 && (
                <StepFlat projects={projects} loading={projectsLoading} project={project} flats={flats} flatsLoading={flatsLoading} flat={flat}
                  onProject={chooseProject} onFlat={chooseFlat} />
              )}
              {step === 1 && <StepCustomer customer={customer} onPick={setCustomer} />}
              {step === 2 && flat && (
                <div className="space-y-5">
                  {/* price */}
                  <Card className="p-5 sm:p-6">
                    <h2 className="text-[15px] font-semibold">{t("Agreed price", "চূড়ান্ত দাম")}</h2>
                    <p className="mt-0.5 text-[13px] text-mute">{t("Pre-filled from the flat's list price; change it if a different price was agreed.", "ফ্ল্যাটের তালিকামূল্য থেকে নেওয়া; ভিন্ন দাম ঠিক হলে বদলান।")}</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label={t("Land share", "জমির অংশ")}><MoneyInput value={price.land} onChange={(v) => setPrice({ ...price, land: v })} /></Field>
                      <Field label={t("Construction", "নির্মাণ")}><MoneyInput value={price.construction} onChange={(v) => setPrice({ ...price, construction: v })} /></Field>
                      <Field label={t("Parking, utility & other", "পার্কিং, ইউটিলিটি ও অন্যান্য")}><MoneyInput value={price.other} onChange={(v) => setPrice({ ...price, other: v })} /></Field>
                      <Field label={t("Discount", "ছাড়")} error={paisa(price.discount) >= subtotal && subtotal > 0 ? t("Must be less than the price.", "দামের চেয়ে কম হতে হবে।") : undefined}>
                        <MoneyInput value={price.discount} onChange={(v) => setPrice({ ...price, discount: v })} />
                      </Field>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-night px-5 py-4 text-paper">
                      <span className="text-sm text-paper/60">{t("Contract price", "চুক্তিমূল্য")}</span>
                      <motion.span key={total} initial={{ opacity: 0.4, y: 4 }} animate={{ opacity: 1, y: 0 }} className="tnum text-2xl font-bold">{taka(total / 100, total % 100 ? 2 : 0)}</motion.span>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                      <Field label={t("Booking date", "বুকিংয়ের তারিখ")} required><Input type="date" value={meta.booking_date} max={today()} onChange={(e) => setMeta({ ...meta, booking_date: e.target.value })} /></Field>
                      <Field label={t("Sold by", "বিক্রেতা")}>
                        <Select value={meta.sales_person} onChange={(e) => setMeta({ ...meta, sales_person: e.target.value })}>
                          <option value="">{t("Not recorded", "উল্লেখ নেই")}</option>
                          {staff.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                        </Select>
                      </Field>
                      <Field label={t("Promised handover", "হস্তান্তরের প্রতিশ্রুত তারিখ")}><Input type="date" value={meta.expected_handover} onChange={(e) => setMeta({ ...meta, expected_handover: e.target.value })} /></Field>
                    </div>
                  </Card>

                  {/* plan builder */}
                  <Card className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-[15px] font-semibold">{t("Payment plan", "কিস্তির পরিকল্পনা")}</h2>
                        <p className="mt-0.5 text-[13px] text-mute">{t("Set the shape, build the schedule, then fine-tune any line below.", "কাঠামো ঠিক করে তালিকা তৈরি করুন, তারপর নিচে যেকোনো লাইন ঠিক করুন।")}</p>
                      </div>
                      <Button variant="dark" loading={building} disabled={!priceValid} icon={<WandSparkles className="size-4" />} onClick={build}>
                        {schedule.length ? t("Rebuild schedule", "তালিকা আবার তৈরি করুন") : t("Build schedule", "তালিকা তৈরি করুন")}
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label={t("Booking money", "বুকিং মানি")}><MoneyInput value={plan.booking_money} onChange={(v) => setPlan({ ...plan, booking_money: v })} /></Field>
                      <Field label={t("Down payment", "ডাউন পেমেন্ট")}><MoneyInput value={plan.down_payment} onChange={(v) => setPlan({ ...plan, down_payment: v })} /></Field>
                      <Field label={t("Down payment date", "ডাউন পেমেন্টের তারিখ")}><Input type="date" value={plan.down_payment_date} onChange={(e) => setPlan({ ...plan, down_payment_date: e.target.value })} /></Field>
                      <Field label={t("On handover", "হস্তান্তরের সময়")}><MoneyInput value={plan.handover_amount} onChange={(v) => setPlan({ ...plan, handover_amount: v })} /></Field>
                      <Field label={t("Installments", "কিস্তির সংখ্যা")}><Input className="tnum text-right" type="number" min={0} max={240} value={plan.installment_count} onChange={(e) => setPlan({ ...plan, installment_count: e.target.value })} /></Field>
                      <Field label={t("First installment", "প্রথম কিস্তি")} hint={t("Blank = one month after booking", "ফাঁকা = বুকিংয়ের এক মাস পর")}><Input type="date" value={plan.first_installment_date} onChange={(e) => setPlan({ ...plan, first_installment_date: e.target.value })} /></Field>
                      <Field label={t("Every … months", "প্রতি … মাসে")}><Input className="tnum text-right" type="number" min={1} max={12} value={plan.interval_months} onChange={(e) => setPlan({ ...plan, interval_months: e.target.value })} /></Field>
                      <Field label={t("Round installments to", "কিস্তি রাউন্ড করুন")}>
                        <Select value={plan.round_to} onChange={(e) => setPlan({ ...plan, round_to: e.target.value })}>
                          <option value="0">{t("Exact split", "হুবহু ভাগ")}</option>
                          <option value="100">{taka(100)}</option><option value="500">{taka(500)}</option><option value="1000">{taka(1000)}</option><option value="5000">{taka(5000)}</option><option value="10000">{taka(10000)}</option>
                        </Select>
                      </Field>
                    </div>
                    <div className="mt-4"><ErrorNote>{planError}</ErrorNote></div>
                  </Card>

                  {/* schedule */}
                  <Card className="overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
                      <h2 className="text-[15px] font-semibold">{t("Schedule", "কিস্তির তালিকা")} <span className="tnum ml-1 text-sm font-normal text-mute">{n(schedule.length)} {t("lines", "লাইন")}</span></h2>
                      <BalanceCheck total={total} scheduled={scheduled} onFix={schedule.length && diff !== 0 && paisa(schedule[schedule.length - 1].amount) + diff > 0
                        ? () => setSchedule((rows) => rows.map((r, i) => (i === rows.length - 1 ? { ...r, amount: tidy((paisa(r.amount) + diff) / 100) } : r)))
                        : undefined} />
                    </div>
                    {building && schedule.length === 0 ? <div className="grid place-items-center py-14"><Spinner /></div>
                      : schedule.length === 0 ? <Empty title={t("No schedule yet", "এখনো তালিকা নেই")} hint={t("Press “Build schedule”, or add lines by hand.", "“তালিকা তৈরি করুন” চাপুন, অথবা হাতে লাইন যোগ করুন।")} />
                      : (
                        <div className="scroll-thin mt-4 max-h-[520px] overflow-auto border-t border-line">
                          <div className="min-w-[560px] divide-y divide-line/70">
                            {schedule.map((r, i) => (
                              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.015, 0.35) }}
                                className="grid grid-cols-[44px_minmax(0,1fr)_160px_170px_40px] items-center gap-2 px-5 py-2 sm:px-6">
                                <span className={cn("tnum grid size-8 place-items-center rounded-lg text-xs font-semibold", r.kind === "BOOKING" ? "bg-brick text-white" : r.kind === "DOWN_PAYMENT" ? "bg-brass text-ink" : r.kind === "HANDOVER" ? "bg-leaf text-white" : "bg-paper-deep text-ink-soft")}>{n(i + 1)}</span>
                                <Input value={r.title} aria-label={t("Title", "শিরোনাম")} onChange={(e) => setSchedule(schedule.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                                <Input type="date" value={r.due_date} aria-label={t("Due date", "ডিউ তারিখ")} onChange={(e) => setSchedule(schedule.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} />
                                <div className="relative">
                                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-mute">৳</span>
                                  <Input className="tnum pl-7 text-right font-medium" inputMode="decimal" value={r.amount} aria-label={t("Amount", "টাকা")} onChange={(e) => setSchedule(schedule.map((x, j) => (j === i ? { ...x, amount: cleanMoney(e.target.value) } : x)))} />
                                </div>
                                <button type="button" aria-label={t("Remove line", "লাইন মুছুন")} onClick={() => setSchedule(schedule.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-lg text-mute transition hover:bg-rose-wash hover:text-rose"><Trash2 className="size-4" /></button>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}
                    <div className="flex items-center justify-between gap-3 border-t border-line bg-paper/70 px-5 py-3 sm:px-6">
                      <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setSchedule([...schedule, { kind: "INSTALLMENT", title: `Installment ${schedule.filter((r) => r.kind === "INSTALLMENT").length + 1}`, due_date: schedule[schedule.length - 1]?.due_date ?? meta.booking_date, amount: diff > 0 ? tidy(diff / 100) : "" }])}>
                        {t("Add line", "লাইন যোগ করুন")}
                      </Button>
                      <span className="text-sm text-mute">{t("Scheduled", "তালিকাভুক্ত")} <b className="tnum ml-1.5 text-base text-ink">{taka(scheduled / 100, scheduled % 100 ? 2 : 0)}</b></span>
                    </div>
                  </Card>

                  <Card className="p-5 sm:p-6">
                    <Field label={t("Notes on this sale", "এই বিক্রি সম্পর্কে নোট")}><Textarea value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} placeholder={t("Anything agreed verbally that the file should remember.", "মৌখিকভাবে যা ঠিক হয়েছে, ফাইলে রাখার মতো।")} /></Field>
                  </Card>

                  {saveError && (
                    <ErrorNote>
                      <b>{saveError.code === "schedule_mismatch" ? t("The schedule does not add up to the contract price. ", "কিস্তির তালিকা চুক্তিমূল্যের সমান নয়। ")
                        : saveError.code === "sales_closed" ? t("Sales are not open for this project. ", "এই প্রজেক্টে বিক্রি খোলা নেই। ") : ""}</b>
                      {saveError.text}
                    </ErrorNote>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* ---------- wizard footer ---------- */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" disabled={step === 0} icon={<ArrowLeft className="size-4" />} onClick={() => go(step - 1)}>{t("Back", "পেছনে")}</Button>
            {step < 2
              ? <Button size="lg" disabled={!canNext} icon={<ArrowRight className="order-last size-4" />} onClick={() => go(step + 1)}>{t("Continue", "পরবর্তী")}</Button>
              : <Button size="lg" loading={saving} disabled={!canSave} icon={!saving && <CircleCheck className="size-4" />} onClick={save}>{t("Save booking", "বুকিং সেভ করুন")}</Button>}
          </div>
        </div>

        {/* ---------- deal sheet ---------- */}
        <motion.aside variants={rise} className="xl:sticky xl:top-6 xl:self-start">
          <div className="relative overflow-hidden rounded-2xl border border-line bg-card shadow-card">
            <div className="bg-night px-5 py-4 text-paper">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-paper/45">{t("Deal sheet", "ডিল শিট")}</p>
              <AnimatePresence mode="wait">
                <motion.p key={flat?.id ?? "none"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-1 text-2xl font-bold tracking-tight">
                  {flat ? <>{project?.code} <span className="text-brass">· {flat.code}</span></> : <span className="text-paper/40">{t("No flat chosen", "ফ্ল্যাট বাছা হয়নি")}</span>}
                </motion.p>
              </AnimatePresence>
              {flat && <p className="tnum mt-0.5 text-xs text-paper/55">{num(flat.size_sqft).toFixed(0)} sft · {flat.flat_type || t("Flat", "ফ্ল্যাট")} · {t("Floor", "তলা")} {n(flat.floor)}{flat.facing ? ` · ${flat.facing}` : ""}</p>}
            </div>
            <div className="space-y-4 p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">{t("Buyer", "ক্রেতা")}</p>
                {customer ? (
                  <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="mt-2 flex items-center gap-3">
                    <Avatar name={customer.name} size={38} />
                    <div className="min-w-0"><div className="truncate text-sm font-semibold">{customer.name}</div><div className="tnum text-xs text-mute">{customer.phone}</div></div>
                  </motion.div>
                ) : <p className="mt-2 text-sm text-mute">{t("Not chosen yet", "এখনো বাছা হয়নি")}</p>}
              </div>
              <div className="border-t border-dashed border-line pt-4 text-sm">
                <SheetRow label={t("Land share", "জমির অংশ")} value={flat ? taka(price.land) : "—"} />
                <SheetRow label={t("Construction", "নির্মাণ")} value={flat ? taka(price.construction) : "—"} />
                <SheetRow label={t("Other charges", "অন্যান্য")} value={flat ? taka(price.other) : "—"} />
                {paisa(price.discount) > 0 && <SheetRow label={t("Discount", "ছাড়")} value={`−${taka(price.discount)}`} tone="text-leaf" />}
                <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2.5">
                  <span className="font-medium">{t("Contract price", "চুক্তিমূল্য")}</span>
                  <span className="tnum text-xl font-bold">{flat ? short(total / 100) : "—"}</span>
                </div>
              </div>
              {schedule.length > 0 && (
                <div className="border-t border-dashed border-line pt-4 text-sm">
                  <SheetRow label={t("Payments", "পেমেন্ট সংখ্যা")} value={n(schedule.length)} />
                  <SheetRow label={t("First due", "প্রথম ডিউ")} value={date(schedule[0].due_date)} />
                  <SheetRow label={t("Last due", "শেষ ডিউ")} value={date(schedule[schedule.length - 1].due_date)} />
                  <div className={cn("mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium", diff === 0 ? "bg-leaf-wash text-leaf" : "bg-rose-wash text-rose")}>
                    {diff === 0 ? <><Equal className="size-4" />{t("Schedule equals the price", "তালিকা দামের সমান")}</> : <><TriangleAlert className="size-4" />{t("Schedule is off by", "তালিকায় পার্থক্য")} {taka(Math.abs(diff) / 100, Math.abs(diff) % 100 ? 2 : 0)}</>}
                  </div>
                </div>
              )}
            </div>
            <div className="hatch h-3 border-t border-line" />
          </div>
        </motion.aside>
      </div>
    </Page>
  );
}

function SheetRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="flex items-baseline justify-between gap-4 py-1"><span className="text-mute">{label}</span><span className={cn("tnum font-medium", tone)}>{value}</span></div>;
}

function BalanceCheck({ total, scheduled, onFix }: { total: number; scheduled: number; onFix?: () => void }) {
  const { t, taka } = useT();
  const diff = total - scheduled;
  const show = (p: number) => taka(Math.abs(p) / 100, Math.abs(p) % 100 ? 2 : 0);
  if (scheduled === 0) return null;
  return (
    <motion.div layout className={cn("flex flex-wrap items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] font-medium", diff === 0 ? "bg-leaf-wash text-leaf" : "bg-rose-wash text-rose")}>
      {diff === 0 ? <><CircleCheck className="size-4" />{t("Adds up exactly to the contract price", "চুক্তিমূল্যের সাথে হুবহু মিলেছে")}</>
        : <>
          <TriangleAlert className="size-4" />
          {diff > 0 ? t(`${show(diff)} still unscheduled`, `${show(diff)} এখনো তালিকার বাইরে`) : t(`${show(diff)} more than the price`, `দামের চেয়ে ${show(diff)} বেশি`)}
          {onFix && <button type="button" onClick={onFix} className="rounded-md bg-rose px-2 py-0.5 text-xs text-white transition hover:brightness-95">{t("Adjust last line", "শেষ লাইনে সমন্বয়")}</button>}
        </>}
    </motion.div>
  );
}

/* ---------- step 1 ---------- */
function StepFlat({ projects, loading, project, flats, flatsLoading, flat, onProject, onFlat }: {
  projects: Project[]; loading: boolean; project: Project | null; flats: Flat[]; flatsLoading: boolean; flat: Flat | null;
  onProject: (p: Project) => void; onFlat: (f: Flat) => void;
}) {
  const { t, short, n } = useT();
  const counts = useMemo(() => {
    const c = { AVAILABLE: 0, HOLD: 0, BOOKED: 0, HANDED_OVER: 0 };
    for (const f of flats) c[f.status]++;
    return c;
  }, [flats]);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {loading && projects.length === 0 && [0, 1].map((i) => <Skeleton key={i} className="h-28" />)}
        {projects.map((p, i) => {
          const active = project?.id === p.id;
          return (
            <motion.button key={p.id} type="button" disabled={!p.sales_open} onClick={() => onProject(p)}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i }}
              className={cn("relative overflow-hidden rounded-2xl border p-4 text-left transition-[transform,box-shadow,border-color] duration-300",
                active ? "border-ink bg-card shadow-lift" : p.sales_open ? "border-line bg-card shadow-card hover:-translate-y-0.5 hover:border-ink/50" : "hatch cursor-not-allowed border-line bg-paper-deep/60")}>
              {active && <motion.span layoutId="project-pick" className="absolute inset-y-0 left-0 w-1.5 bg-brick" />}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brick">{p.code}</span>
                  <h3 className="truncate text-[15px] font-semibold">{p.name}</h3>
                  <p className="truncate text-xs text-mute">{p.location}</p>
                </div>
                {p.sales_open ? <Badge tone="leaf" dot>{t("Selling", "বিক্রি চলছে")}</Badge> : <Badge tone="neutral"><Lock className="size-3" />{t("Sales closed", "বিক্রি বন্ধ")}</Badge>}
              </div>
              {p.sales_open
                ? <p className="tnum mt-3 text-sm text-ink-soft"><b className="text-ink">{n(p.flats_total - p.flats_sold)}</b> {t("of", "/")} {n(p.flats_total)} {t("flats still unsold", "ফ্ল্যাট অবিক্রিত")}</p>
                : <p className="mt-3 text-[13px] text-ink-soft">{p.documents_pending > 0
                  ? t(`${p.documents_pending} required documents are still pending, so this project cannot be sold yet.`, `${n(p.documents_pending)}টি আবশ্যক ডকুমেন্ট বাকি, তাই এই প্রজেক্ট এখনো বিক্রি করা যাবে না।`)
                  : t("Sales have not been opened for this project yet.", "এই প্রজেক্টে এখনো বিক্রি খোলা হয়নি।")}</p>}
            </motion.button>
          );
        })}
      </div>

      {project && (
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">{t("Pick an available flat", "একটি খালি ফ্ল্যাট বাছুন")}</h2>
              <p className="mt-0.5 text-[13px] text-mute">{project.name}</p>
            </div>
            <StatusLegend items={[
              { status: "AVAILABLE", label: t("Available", "খালি"), count: counts.AVAILABLE },
              { status: "BOOKED", label: t("Booked", "বুকড"), count: counts.BOOKED },
              { status: "HANDED_OVER", label: t("Handed over", "হস্তান্তরিত"), count: counts.HANDED_OVER },
              { status: "HOLD", label: t("On hold", "হোল্ড"), count: counts.HOLD },
            ]} />
          </div>
          {flatsLoading && flats.length === 0 ? <Skeleton className="h-72" />
            : flats.length === 0 ? <Empty title={t("This project has no flats yet", "এই প্রজেক্টে এখনো ফ্ল্যাট যোগ হয়নি")} />
            : <FlatGrid flats={flats} selected={flat?.id ?? null} selectable={(f) => f.status === "AVAILABLE"} onSelect={(f) => { const full = flats.find((x) => x.id === f.id); if (full) onFlat(full); }}
                renderMeta={(f) => f.status === "AVAILABLE" ? <span className="tnum font-medium text-ink">{short(f.list_price)}</span> : f.booking ? f.booking.customer : t("On hold", "হোল্ড")} />}
        </Card>
      )}
      {!project && projects.some((p) => p.sales_open) && (
        <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-mute">{t("Choose a project above to see its floors and flats.", "তলা ও ফ্ল্যাট দেখতে উপরে একটি প্রজেক্ট বাছুন।")}</div>
      )}
      {!project && !loading && projects.length > 0 && !projects.some((p) => p.sales_open) && (
        <Card><Empty icon={<Lock />} title={t("No project is open for sale", "কোনো প্রজেক্টে বিক্রি খোলা নেই")} hint={t("Complete a project's document checklist and open sales first.", "আগে প্রজেক্টের ডকুমেন্ট চেকলিস্ট সম্পূর্ণ করে বিক্রি খুলুন।")}
          action={<Link href="/projects"><Button variant="outline">{t("Go to projects", "প্রজেক্টে যান")}</Button></Link>} /></Card>
      )}
    </div>
  );
}

/* ---------- step 2 ---------- */
function StepCustomer({ customer, onPick }: { customer: Customer | null; onPick: (c: Customer | null) => void }) {
  const { t, n } = useT();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>(emptyCustomer());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const q = useDebounced(search.trim(), 250);
  const { rows, loading } = useList<Customer>(`/customers${qs({ search: q, page_size: 30 })}`);

  async function create() {
    setBusy(true);
    setError("");
    try {
      const c = await api.post<Customer>("/customers", draft);
      await refreshAll();
      onPick(c);
      setCreating(false);
      setDraft(emptyCustomer());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{t("Who is buying?", "কে কিনছেন?")}</h2>
          <p className="mt-0.5 text-[13px] text-mute">{t("Pick an existing customer or add a new one.", "আগের ক্রেতা বাছুন অথবা নতুন যোগ করুন।")}</p>
        </div>
        <Button variant={creating ? "ghost" : "outline"} icon={<UserPlus className="size-4" />} onClick={() => { setCreating((v) => !v); if (!creating && search && !/^\d/.test(search)) setDraft({ ...emptyCustomer(), name: search }); }}>
          {creating ? t("Back to search", "খোঁজায় ফিরুন") : t("New customer", "নতুন ক্রেতা")}
        </Button>
      </div>

      {customer && !creating && (
        <motion.div layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-leaf bg-leaf-wash/60 p-4">
          <Avatar name={customer.name} size={46} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{customer.name}</div>
            <div className="tnum text-sm text-ink-soft">{customer.phone}{customer.address ? ` · ${customer.address}` : ""}</div>
          </div>
          <Badge tone="leaf"><Check className="size-3" />{t("Selected", "নির্বাচিত")}</Badge>
          <Button size="sm" variant="ghost" onClick={() => onPick(null)}>{t("Change", "বদলান")}</Button>
        </motion.div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {creating ? (
          <motion.div key="create" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-5 space-y-4">
            <CustomerFields value={draft} onChange={setDraft} autoFocus />
            <ErrorNote>{error}</ErrorNote>
            <div className="flex justify-end"><Button loading={busy} disabled={!draft.name.trim() || !draft.phone.trim()} onClick={create}>{t("Save & select", "সেভ করে বাছুন")}</Button></div>
          </motion.div>
        ) : (
          <motion.div key="search" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute" />
              <Input className="h-12 pl-10 text-[15px]" placeholder={t("Search by name or phone", "নাম বা ফোন দিয়ে খুঁজুন")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {loading && rows.length === 0 && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
              {rows.map((c, i) => {
                const picked = customer?.id === c.id;
                return (
                  <motion.button key={c.id} type="button" onClick={() => onPick(c)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className={cn("flex items-center gap-3 rounded-xl border p-3 text-left transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-card", picked ? "border-leaf bg-leaf-wash/50" : "border-line bg-card hover:border-ink/50")}>
                    <Avatar name={c.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{c.name}</div>
                      <div className="tnum truncate text-xs text-mute">{c.phone}</div>
                    </div>
                    {c.bookings_count > 0 && <Badge tone="brass">{n(c.bookings_count)} {t("flat", "ফ্ল্যাট")}</Badge>}
                    {picked && <Check className="size-4 text-leaf" />}
                  </motion.button>
                );
              })}
            </div>
            {!loading && rows.length === 0 && (
              <Empty title={t("No customer found", "কোনো ক্রেতা পাওয়া যায়নি")} hint={t("Add them as a new customer to continue.", "চালিয়ে যেতে নতুন ক্রেতা হিসেবে যোগ করুন।")}
                action={<Button icon={<UserPlus className="size-4" />} onClick={() => { setCreating(true); setDraft({ ...emptyCustomer(), name: /^\d/.test(search) ? "" : search, phone: /^\d/.test(search) ? search : "" }); }}>{t("New customer", "নতুন ক্রেতা")}</Button>} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
