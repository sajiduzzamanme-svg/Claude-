"use client";

import { Plus, Printer, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { api, refreshAll, useList } from "@/lib/api";
import { num, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Account, BookingDetail, CostCategory, CostHead, Installment, Project, Receipt } from "@/lib/types";
import { Logo } from "./shell";
import { Badge, Button, ErrorNote, Field, Input, Modal, MoneyInput, Select, Textarea, cn, useAction, useOnOpen, type Tone } from "./ui";

/* ---------- shared lookups ---------- */
export const useProjects = () => useList<Project>("/projects");
export const useCash = () => useList<Account>("/accounts/cash");
export const useCostHeads = () => useList<CostHead>("/cost-heads?is_active=true");

export const CATEGORIES: { id: CostCategory; en: string; bn: string; color: string }[] = [
  { id: "LAND", en: "Land", bn: "জমি", color: "var(--color-brass)" },
  { id: "DESIGN", en: "Design & approval", bn: "ডিজাইন ও অনুমোদন", color: "var(--color-plum)" },
  { id: "CONSTRUCTION", en: "Construction", bn: "নির্মাণ", color: "var(--color-brick)" },
  { id: "MARKETING", en: "Sales & marketing", bn: "বিক্রয় ও বিপণন", color: "var(--color-sky)" },
  { id: "OVERHEAD", en: "Office & overhead", bn: "অফিস ও ওভারহেড", color: "var(--color-ink-soft)" },
  { id: "CONTINGENCY", en: "Contingency", bn: "কন্টিনজেন্সি", color: "var(--color-leaf)" },
];

type LabelDef = { en: string; bn: string; tone: Tone };
const L = (en: string, bn: string, tone: Tone = "neutral"): LabelDef => ({ en, bn, tone });
export const LABELS: Record<string, Record<string, LabelDef>> = {
  flat: { AVAILABLE: L("Available", "খালি", "neutral"), HOLD: L("On hold", "হোল্ড", "ink"), BOOKED: L("Booked", "বুকড", "brass"), HANDED_OVER: L("Handed over", "হস্তান্তরিত", "leaf") },
  booking: { ACTIVE: L("Active", "চলমান", "sky"), HANDED_OVER: L("Handed over", "হস্তান্তরিত", "leaf"), CANCELLED: L("Cancelled", "বাতিল", "rose") },
  installment: { PAID: L("Paid", "পরিশোধিত", "leaf"), PARTIAL: L("Part paid", "আংশিক", "brass"), DUE: L("Upcoming", "আসন্ন", "neutral"), OVERDUE: L("Overdue", "বকেয়া", "rose") },
  doc: { POSTED: L("Posted", "পোস্টেড", "leaf"), VOIDED: L("Voided", "বাতিল", "rose"), DRAFT: L("Draft", "খসড়া", "neutral"), APPROVED: L("Approved", "অনুমোদিত", "leaf"), SUPERSEDED: L("Superseded", "পুরোনো", "neutral"), RECEIVED: L("Received", "গৃহীত", "leaf"), PENDING: L("Pending", "বাকি", "brass"), CANCELLED: L("Cancelled", "বাতিল", "rose") },
  project: { PLANNING: L("Planning", "পরিকল্পনা", "plum"), ACTIVE: L("Active", "চলমান", "leaf"), COMPLETED: L("Completed", "সম্পন্ন", "sky"), CLOSED: L("Closed", "বন্ধ", "neutral") },
  land: { NEGOTIATION: L("Negotiation", "আলোচনা", "neutral"), BAYNA: L("Bayna", "বায়না", "brass"), REGISTERED: L("Registered", "রেজিস্ট্রি", "sky"), MUTATED: L("Mutation done", "নামজারি সম্পন্ন", "leaf") },
  lead: { NEW: L("New", "নতুন", "sky"), CONTACTED: L("Contacted", "যোগাযোগ হয়েছে", "plum"), SITE_VISIT: L("Site visit", "সাইট ভিজিট", "brass"), NEGOTIATION: L("Negotiation", "দরদাম", "brick"), WON: L("Won", "সফল", "leaf"), LOST: L("Lost", "হারানো", "neutral") },
  method: { CASH: L("Cash", "নগদ"), BANK: L("Bank", "ব্যাংক"), CHEQUE: L("Cheque", "চেক"), MOBILE: L("Mobile banking", "মোবাইল ব্যাংকিং") },
  vendor: { SUPPLIER: L("Supplier", "সরবরাহকারী", "sky"), CONTRACTOR: L("Contractor", "ঠিকাদার", "brick"), LABOUR: L("Labour", "লেবার", "brass"), CONSULTANT: L("Consultant", "কনসালট্যান্ট", "plum") },
  work: { PLANNED: L("Planned", "পরিকল্পিত", "neutral"), IN_PROGRESS: L("In progress", "চলমান", "brass"), DONE: L("Done", "সম্পন্ন", "leaf") },
  bill: { MATERIAL: L("Material", "মালামাল", "sky"), CONTRACTOR: L("Contractor bill", "ঠিকাদারের বিল", "brick"), LABOUR: L("Labour", "লেবার", "brass"), SERVICE: L("Service", "সেবা", "plum") },
  role: { OWNER: L("Owner", "মালিক", "brick"), ADMIN: L("Admin", "অ্যাডমিন", "ink"), ACCOUNTS: L("Accounts", "হিসাব", "leaf"), SALES: L("Sales", "বিক্রয়", "sky"), ENGINEER: L("Engineer", "ইঞ্জিনিয়ার", "brass"), PURCHASE: L("Purchase", "ক্রয়", "plum") },
  account: { ASSET: L("Assets", "সম্পদ", "leaf"), LIABILITY: L("Liabilities", "দায়", "brick"), EQUITY: L("Equity", "মূলধন", "plum"), INCOME: L("Income", "আয়", "sky"), EXPENSE: L("Expenses", "ব্যয়", "brass") },
};

export function useLabel() {
  const { t } = useT();
  return (group: keyof typeof LABELS | string, key: string) => {
    const d = LABELS[group]?.[key];
    return d ? t(d.en, d.bn) : key;
  };
}
export function StatusBadge({ group, value, dot = true }: { group: string; value: string; dot?: boolean }) {
  const label = useLabel();
  return <Badge tone={LABELS[group]?.[value]?.tone ?? "neutral"} dot={dot}>{label(group, value)}</Badge>;
}

/* ---------- pickers ---------- */
export function ProjectSelect({ value, onChange, all, className }: { value: string; onChange: (v: string) => void; all?: string; className?: string }) {
  const { rows } = useProjects();
  const { t } = useT();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{all ?? t("Choose project", "প্রজেক্ট বাছুন")}</option>
      {rows.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
    </Select>
  );
}
export function CashSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { rows } = useCash();
  const { t, short } = useT();
  useEffect(() => {
    if (!value && rows.length) onChange(String((rows.find((a) => a.system_key === "BANK") ?? rows[0]).id));
  }, [rows, value, onChange]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {rows.map((a) => <option key={a.id} value={a.id}>{t(a.name, a.name_bn)} · {short(a.balance)}</option>)}
    </Select>
  );
}
export function CostHeadSelect({ value, onChange, only, className }: { value: string; onChange: (v: string) => void; only?: CostCategory[]; className?: string }) {
  const { rows } = useCostHeads();
  const { t } = useT();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{t("Cost head", "খরচের খাত")}</option>
      {CATEGORIES.filter((c) => !only || only.includes(c.id)).map((c) => (
        <optgroup key={c.id} label={t(c.en, c.bn)}>
          {rows.filter((h) => h.category === c.id).map((h) => <option key={h.id} value={h.id}>{h.code} · {t(h.name, h.name_bn || h.name)}</option>)}
        </optgroup>
      ))}
    </Select>
  );
}

/* ---------- line items (bills, purchase orders, estimates) ---------- */
export type LineDraft = { cost_head: string; description: string; unit: string; quantity: string; rate: string; amount: string };
export const emptyLine = (): LineDraft => ({ cost_head: "", description: "", unit: "", quantity: "1", rate: "", amount: "" });
export const lineTotal = (l: LineDraft) => (num(l.rate) > 0 ? Math.round(num(l.quantity) * num(l.rate) * 100) / 100 : num(l.amount));
/** Shape lines for the API: send qty×rate when a rate is given, otherwise the lump-sum amount. */
export function linesPayload(lines: LineDraft[], nameField: "description" | "item" = "description") {
  return lines.filter((l) => l.cost_head && lineTotal(l) > 0).map((l) => ({
    cost_head: Number(l.cost_head), [nameField]: l.description, unit: l.unit,
    quantity: num(l.rate) > 0 ? l.quantity || "1" : "1",
    rate: num(l.rate) > 0 ? l.rate : "0",
    ...(num(l.rate) > 0 ? {} : { amount: l.amount }),
  }));
}

export function LineItems({ lines, onChange, only, itemLabel }: { lines: LineDraft[]; onChange: (l: LineDraft[]) => void; only?: CostCategory[]; itemLabel?: string }) {
  const { t, taka } = useT();
  const set = (i: number, patch: Partial<LineDraft>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((a, l) => a + lineTotal(l), 0);
  return (
    <div className="rounded-2xl border border-line">
      <div className="hidden grid-cols-[1.3fr_1.5fr_70px_80px_110px_120px_36px] gap-2 border-b border-line bg-paper/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute md:grid">
        <span>{t("Cost head", "খরচের খাত")}</span><span>{itemLabel ?? t("Description", "বিবরণ")}</span><span>{t("Unit", "একক")}</span>
        <span className="text-right">{t("Qty", "পরিমাণ")}</span><span className="text-right">{t("Rate", "দর")}</span><span className="text-right">{t("Amount", "টাকা")}</span><span />
      </div>
      <div className="divide-y divide-line/70">
        {lines.map((l, i) => (
          <motion.div key={i} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-2 p-3 md:grid-cols-[1.3fr_1.5fr_70px_80px_110px_120px_36px] md:items-start">
            <CostHeadSelect value={l.cost_head} onChange={(v) => set(i, { cost_head: v })} only={only} className="col-span-2 md:col-span-1" />
            <Input className="col-span-2 md:col-span-1" placeholder={itemLabel ?? t("Description", "বিবরণ")} value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
            <Input placeholder={t("Unit", "একক")} value={l.unit} onChange={(e) => set(i, { unit: e.target.value })} />
            <Input className="tnum text-right" inputMode="decimal" placeholder="1" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value.replace(/[^\d.]/g, "") })} />
            <Input className="tnum text-right" inputMode="decimal" placeholder={t("Rate", "দর")} value={l.rate} onChange={(e) => set(i, { rate: e.target.value.replace(/[^\d.]/g, "") })} />
            {num(l.rate) > 0
              ? <div className="tnum grid h-10 place-items-end content-center rounded-[10px] bg-paper-deep px-3 text-sm font-semibold">{taka(lineTotal(l))}</div>
              : <Input className="tnum text-right font-semibold" inputMode="decimal" placeholder={t("Amount", "টাকা")} value={l.amount} onChange={(e) => set(i, { amount: e.target.value.replace(/[^\d.]/g, "") })} />}
            <button type="button" onClick={() => onChange(lines.length > 1 ? lines.filter((_, j) => j !== i) : [emptyLine()])} aria-label={t("Remove line", "লাইন মুছুন")} className="grid h-10 place-items-center rounded-lg text-mute transition hover:bg-rose-wash hover:text-rose">
              <Trash2 className="size-4" />
            </button>
          </motion.div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line bg-paper/70 px-3 py-2.5">
        <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => onChange([...lines, emptyLine()])}>{t("Add line", "লাইন যোগ করুন")}</Button>
        <div className="text-sm">{t("Total", "মোট")} <b className="tnum ml-2 text-base">{taka(total)}</b></div>
      </div>
    </div>
  );
}

/* ---------- void with a reason ---------- */
export function VoidModal({ open, onClose, title, hint, onConfirm }: { open: boolean; onClose: () => void; title: string; hint?: string; onConfirm: (reason: string) => Promise<unknown> }) {
  const { t } = useT();
  const [reason, setReason] = useState("");
  const { busy, error, run, setError } = useAction();
  useOnOpen(open, () => { setReason(""); setError(""); });
  return (
    <Modal open={open} onClose={onClose} size="sm" title={title}
      subtitle={hint ?? t("The original entry stays in the books; a reversing entry is added.", "মূল এন্ট্রি হিসাবে থেকে যাবে; একটি বিপরীত এন্ট্রি যোগ হবে।")}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Keep it", "থাক")}</Button>
        <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={async () => { const ok = await run(async () => { await onConfirm(reason.trim()); await refreshAll(); return true; }, t("Voided", "বাতিল করা হয়েছে")); if (ok) onClose(); }}>{t("Void", "বাতিল করুন")}</Button>
      </>}>
      <div className="space-y-3">
        <Field label={t("Reason", "কারণ")} required><Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("e.g. cheque bounced, entered twice", "যেমন: চেক বাউন্স, দুবার এন্ট্রি")} /></Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

/* ---------- receive money from a flat owner ---------- */
type ReceiveTarget = { id: number; number: string; customer_name: string; project_code: string; flat_code: string; outstanding: string; overdue: string };

export function ReceiveModal({ booking, installments, open, onClose, onDone }: {
  booking: ReceiveTarget | null; installments?: Installment[]; open: boolean; onClose: () => void; onDone?: (receipt: Receipt | null) => void;
}) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const blank = () => ({ date: today(), amount: "", method: "BANK", deposit_account: "", reference: "", bank_name: "", note: "" });
  const [f, setF] = useState(blank);
  const { rows: cash } = useCash();
  useOnOpen(open, () => { setF(blank()); setError(""); }, booking?.id);
  // Until the user picks an account, suggest the one that matches how the money came in.
  const suggestedKey = f.method === "CASH" ? "CASH" : f.method === "MOBILE" ? "MOBILE" : "BANK";
  const account = f.deposit_account || String(cash.find((a) => a.system_key === suggestedKey)?.id ?? cash[0]?.id ?? "");

  const next = installments?.find((i) => num(i.outstanding) > 0);
  const outstanding = num(booking?.outstanding);
  const amount = num(f.amount);
  const tooMuch = amount > outstanding + 0.001;
  const chips = [
    next && { label: t("Next installment", "পরের কিস্তি"), value: next.outstanding },
    num(booking?.overdue) > 0 && { label: t("All overdue", "সব বকেয়া"), value: booking!.overdue },
    outstanding > 0 && { label: t("Full balance", "পুরো বাকি"), value: booking!.outstanding },
  ].filter(Boolean) as { label: string; value: string }[];

  async function submit() {
    if (!booking) return;
    const res = await run(async () => {
      const out = await api.post<BookingDetail>(`/bookings/${booking.id}/receive`, { ...f, deposit_account: Number(account) });
      await refreshAll();
      return out;
    }, t("Payment received", "টাকা গৃহীত হয়েছে"));
    if (res) {
      onDone?.(res.receipts.find((r) => r.id === res.new_receipt_id) ?? null);
      onClose();
    }
  }

  return (
    <Modal open={open && !!booking} onClose={onClose} title={t("Receive payment", "টাকা গ্রহণ")}
      subtitle={booking && `${booking.customer_name} · ${booking.project_code} ${booking.flat_code} · ${booking.number}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!amount || tooMuch || !account} onClick={submit}>{t("Save & issue receipt", "সেভ করে রিসিট দিন")}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-paper-deep/70 p-4 text-sm">
          <div><div className="text-mute">{t("Still to pay", "মোট বাকি")}</div><div className="tnum text-lg font-semibold">{taka(booking?.outstanding)}</div></div>
          <div><div className="text-mute">{t("Of which overdue", "এর মধ্যে বকেয়া")}</div><div className={cn("tnum text-lg font-semibold", num(booking?.overdue) > 0 && "text-rose")}>{taka(booking?.overdue)}</div></div>
        </div>
        <Field label={t("Amount received", "প্রাপ্ত টাকা")} required error={tooMuch ? t(`More than the customer owes (${taka(outstanding)}).`, `ক্রেতার বাকির (${taka(outstanding)}) চেয়ে বেশি।`) : undefined}>
          <MoneyInput autoFocus value={f.amount} onChange={(v) => setF({ ...f, amount: v })} className="h-12 text-lg" />
        </Field>
        {chips.length > 0 && (
          <div className="-mt-1 flex flex-wrap gap-2">
            {chips.map((c) => (
              <button key={c.label} type="button" onClick={() => setF({ ...f, amount: String(num(c.value)) })} className="rounded-full border border-line bg-card px-3 py-1 text-xs font-medium transition hover:border-ink hover:bg-brass-wash">
                {c.label} · <span className="tnum">{taka(c.value)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Date", "তারিখ")} required><Input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={t("Received by", "মাধ্যম")}>
            <Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value, deposit_account: "" })}>
              <option value="BANK">{t("Bank transfer / deposit", "ব্যাংক ট্রান্সফার / জমা")}</option>
              <option value="CHEQUE">{t("Cheque", "চেক")}</option>
              <option value="CASH">{t("Cash", "নগদ")}</option>
              <option value="MOBILE">{t("Mobile banking", "মোবাইল ব্যাংকিং")}</option>
            </Select>
          </Field>
          <Field label={t("Deposited into", "যে হিসাবে জমা")} required><CashSelect value={account} onChange={(v) => setF((s) => ({ ...s, deposit_account: v }))} /></Field>
          <Field label={f.method === "CHEQUE" ? t("Cheque number", "চেক নম্বর") : t("Reference / transaction ID", "রেফারেন্স / ট্রানজ্যাকশন আইডি")}><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
          {(f.method === "CHEQUE" || f.method === "BANK") && <Field label={t("Bank name", "ব্যাংকের নাম")}><Input value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></Field>}
          <Field label={t("Note", "নোট")} className={f.method === "CHEQUE" || f.method === "BANK" ? "" : "sm:col-span-2"}><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

/* ---------- printable money receipt ---------- */
export function ReceiptSlip({ receipt, open, onClose }: { receipt: Receipt | null; open: boolean; onClose: () => void }) {
  const { t, taka, date } = useT();
  const label = useLabel();
  const words = useMemo(() => (receipt ? amountInWords(num(receipt.amount)) : ""), [receipt]);
  return (
    <Modal open={open && !!receipt} onClose={onClose} size="lg" title={t("Money receipt", "মানি রিসিট")} subtitle={receipt?.number}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Close", "বন্ধ")}</Button><Button variant="dark" icon={<Printer className="size-4" />} onClick={() => window.print()}>{t("Print", "প্রিন্ট")}</Button></>}>
      {receipt && (
        <div id="print-area" className="relative overflow-hidden rounded-2xl border-2 border-ink bg-white p-6 sm:p-8">
          {receipt.status === "VOIDED" && <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="-rotate-12 rounded-xl border-4 border-rose px-6 py-2 text-5xl font-black tracking-widest text-rose/70">VOID</span></div>}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-dashed border-line pb-5">
            <div><Logo size={36} /><p className="mt-2 text-xs text-mute">{receipt.project_name}</p></div>
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brick">{t("Money receipt", "মানি রিসিট")}</div>
              <div className="tnum mt-1 text-lg font-bold">{receipt.number}</div>
              <div className="text-sm text-mute">{date(receipt.date)}</div>
            </div>
          </div>
          <div className="grid gap-x-8 gap-y-3 py-5 text-sm sm:grid-cols-2">
            <SlipRow k={t("Received from", "প্রদানকারী")} v={receipt.customer_name} />
            <SlipRow k={t("Phone", "ফোন")} v={receipt.customer_phone} />
            <SlipRow k={t("Flat", "ফ্ল্যাট")} v={`${receipt.project_code} · ${receipt.flat_code}`} />
            <SlipRow k={t("Booking", "বুকিং")} v={receipt.booking_number} />
            <SlipRow k={t("Paid by", "মাধ্যম")} v={`${label("method", receipt.method)}${receipt.bank_name ? ` · ${receipt.bank_name}` : ""}`} />
            <SlipRow k={t("Reference", "রেফারেন্স")} v={receipt.reference || "—"} />
          </div>
          <div className="rounded-xl bg-paper p-4">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0"><div className="text-xs uppercase tracking-[0.14em] text-mute">{t("Amount", "টাকার পরিমাণ")}</div><div className="mt-1 text-sm italic text-ink-soft">{words}</div></div>
              <div className="tnum whitespace-nowrap text-3xl font-bold">{taka(receipt.amount, 2)}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 text-xs uppercase tracking-[0.14em] text-mute">{t("Applied to", "যে কিস্তিতে সমন্বয়")}</div>
            <ul className="divide-y divide-line/70 text-sm">
              {receipt.allocations.map((a) => <li key={a.installment} className="flex justify-between py-1.5"><span>{a.title}</span><span className="tnum font-medium">{taka(a.amount, 2)}</span></li>)}
            </ul>
          </div>
          <div className="mt-10 flex justify-between gap-6 text-xs text-mute">
            <div className="w-40 border-t border-ink pt-1.5 text-center">{t("Customer", "ক্রেতা")}</div>
            <div className="w-40 border-t border-ink pt-1.5 text-center">{receipt.received_by || t("Received by", "গ্রহণকারী")}</div>
          </div>
        </div>
      )}
    </Modal>
  );
}
function SlipRow({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 border-b border-line/60 pb-1.5"><span className="text-mute">{k}</span><span className="text-right font-medium">{v}</span></div>;
}

/** 1250000 → "Taka twelve lakh fifty thousand only" */
export function amountInWords(n: number): string {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const two = (x: number) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? "-" + ones[x % 10] : ""));
  const three = (x: number) => (x >= 100 ? ones[Math.floor(x / 100)] + " hundred" + (x % 100 ? " " + two(x % 100) : "") : two(x));
  const whole = Math.floor(n);
  const paisa = Math.round((n - whole) * 100);
  if (whole === 0 && paisa === 0) return "Taka zero only";
  const parts: string[] = [];
  const crore = Math.floor(whole / 1e7), lakh = Math.floor((whole % 1e7) / 1e5), thousand = Math.floor((whole % 1e5) / 1e3), rest = whole % 1e3;
  if (crore) parts.push((crore >= 1000 ? amountInWords(crore).replace(/^Taka | only$/g, "") : three(crore)) + " crore");
  if (lakh) parts.push(two(lakh) + " lakh");
  if (thousand) parts.push(two(thousand) + " thousand");
  if (rest) parts.push(three(rest));
  return "Taka " + parts.join(" ") + (paisa ? ` and ${two(paisa)} paisa` : "") + " only";
}
