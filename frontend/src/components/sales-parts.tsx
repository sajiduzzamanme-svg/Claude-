"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { api, refreshAll, useList } from "@/lib/api";
import type { Role } from "@/lib/auth";
import { num, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Cancellation, Customer, Staff } from "@/lib/types";
import { CashSelect } from "./forms";
import { Button, ErrorNote, Field, Input, Modal, MoneyInput, Textarea, cn, ease, useAction } from "./ui";

/** Roles allowed to cancel, hand over or transfer a booking (mirrors the API). */
export const DEAL_ROLES: Role[] = ["OWNER", "ADMIN", "ACCOUNTS"];

export const useStaff = () => useList<Staff>("/staff");

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Reset a dialog's form at the moment it opens (or its subject changes).
 *  Done while rendering — React's "adjust state when a prop changes" pattern — rather than in an effect. */
export function useOnOpen(open: boolean, reset: () => void, id: unknown = null) {
  const [seen, setSeen] = useState<{ open: boolean; id: unknown }>({ open: false, id: null });
  if (seen.open !== open || (open && seen.id !== id)) {
    setSeen({ open, id });
    if (open) reset();
  }
}

/** Money as integer paisa, so sums can be compared exactly. */
export const paisa = (v: string | number | null | undefined) => Math.round(num(v) * 100);
export const fromPaisa = (p: number) => (p / 100).toFixed(2);
/** "3800000.00" → "3800000" for a tidy input value. */
export const tidy = (v: string | number | null | undefined) => {
  const p = paisa(v);
  return p === 0 ? "" : p % 100 === 0 ? String(p / 100) : fromPaisa(p);
};

/* ---------- customer form ---------- */
export type CustomerDraft = {
  name: string; phone: string; email: string; nid: string; father_name: string; address: string;
  occupation: string; nominee_name: string; nominee_relation: string; notes: string;
};
export const emptyCustomer = (): CustomerDraft => ({
  name: "", phone: "", email: "", nid: "", father_name: "", address: "", occupation: "", nominee_name: "", nominee_relation: "", notes: "",
});
export const customerToDraft = (c: Customer): CustomerDraft => ({
  name: c.name, phone: c.phone, email: c.email, nid: c.nid, father_name: c.father_name, address: c.address,
  occupation: c.occupation, nominee_name: c.nominee_name, nominee_relation: c.nominee_relation, notes: c.notes,
});

export function CustomerFields({ value, onChange, autoFocus }: { value: CustomerDraft; onChange: (v: CustomerDraft) => void; autoFocus?: boolean }) {
  const { t } = useT();
  const set = (patch: Partial<CustomerDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("Full name", "পুরো নাম")} required><Input autoFocus={autoFocus} value={value.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label={t("Phone", "ফোন")} required><Input inputMode="tel" value={value.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="01XXXXXXXXX" /></Field>
      <Field label={t("Father's name", "পিতার নাম")}><Input value={value.father_name} onChange={(e) => set({ father_name: e.target.value })} /></Field>
      <Field label={t("National ID", "জাতীয় পরিচয়পত্র")}><Input value={value.nid} onChange={(e) => set({ nid: e.target.value })} /></Field>
      <Field label={t("Email", "ইমেইল")}><Input type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} /></Field>
      <Field label={t("Occupation", "পেশা")}><Input value={value.occupation} onChange={(e) => set({ occupation: e.target.value })} /></Field>
      <Field label={t("Address", "ঠিকানা")} className="sm:col-span-2"><Input value={value.address} onChange={(e) => set({ address: e.target.value })} /></Field>
      <Field label={t("Nominee", "নমিনি")}><Input value={value.nominee_name} onChange={(e) => set({ nominee_name: e.target.value })} /></Field>
      <Field label={t("Relation with nominee", "নমিনির সাথে সম্পর্ক")}><Input value={value.nominee_relation} onChange={(e) => set({ nominee_relation: e.target.value })} /></Field>
      <Field label={t("Notes", "নোট")} className="sm:col-span-2"><Textarea value={value.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
    </div>
  );
}

export function CustomerModal({ open, onClose, customer, onSaved }: {
  open: boolean; onClose: () => void; customer?: Customer | null; onSaved?: (c: Customer) => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<CustomerDraft>(emptyCustomer());
  const { busy, error, run, setError } = useAction();
  useOnOpen(open, () => {
    setDraft(customer ? customerToDraft(customer) : emptyCustomer());
    setError("");
  }, customer?.id ?? "new");

  async function save() {
    const saved = await run(async () => {
      const out = customer ? await api.patch<Customer>(`/customers/${customer.id}`, draft) : await api.post<Customer>("/customers", draft);
      await refreshAll();
      return out;
    }, customer ? t("Customer updated", "ক্রেতার তথ্য হালনাগাদ হয়েছে") : t("Customer added", "ক্রেতা যোগ হয়েছে"));
    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={customer ? t("Edit customer", "ক্রেতার তথ্য সম্পাদনা") : t("New customer", "নতুন ক্রেতা")}
      subtitle={t("Name and phone are required; the rest can be filled in later.", "নাম ও ফোন আবশ্যক; বাকিটা পরে পূরণ করা যাবে।")}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!draft.name.trim() || !draft.phone.trim()} onClick={save}>{t("Save customer", "ক্রেতা সেভ করুন")}</Button>
      </>}>
      <div className="space-y-4">
        <CustomerFields value={draft} onChange={setDraft} autoFocus />
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

/* ---------- refund after a cancellation ---------- */
export function RefundModal({ cancellation, open, onClose }: { cancellation: Cancellation | null; open: boolean; onClose: () => void }) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const [f, setF] = useState({ date: today(), amount: "", paid_from: "", reference: "" });
  const owed = num(cancellation?.refund_outstanding);
  useOnOpen(open, () => {
    setF({ date: today(), amount: tidy(cancellation?.refund_outstanding), paid_from: "", reference: "" });
    setError("");
  }, cancellation?.id);
  const amount = num(f.amount);
  const tooMuch = amount > owed + 0.001;

  async function submit() {
    if (!cancellation) return;
    const ok = await run(async () => {
      await api.post(`/cancellations/${cancellation.id}/refund`, { date: f.date, amount: f.amount, paid_from: Number(f.paid_from), reference: f.reference });
      await refreshAll();
      return true;
    }, t("Refund paid", "রিফান্ড পরিশোধ হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={open && !!cancellation} onClose={onClose} title={t("Pay refund", "রিফান্ড পরিশোধ")}
      subtitle={cancellation && `${cancellation.customer_name} · ${cancellation.project_code} ${cancellation.flat_code} · ${cancellation.booking_number}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!amount || tooMuch || !f.paid_from} onClick={submit}>{t("Pay refund", "রিফান্ড দিন")}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 rounded-2xl bg-paper-deep/70 p-4 text-sm">
          <div><div className="text-mute">{t("Refund agreed", "নির্ধারিত রিফান্ড")}</div><div className="tnum text-base font-semibold">{taka(cancellation?.refund_amount)}</div></div>
          <div><div className="text-mute">{t("Already paid", "ইতিমধ্যে দেওয়া")}</div><div className="tnum text-base font-semibold">{taka(cancellation?.refunded_amount)}</div></div>
          <div><div className="text-mute">{t("Still owed", "এখনো বাকি")}</div><div className="tnum text-base font-semibold text-brick">{taka(owed)}</div></div>
        </div>
        <Field label={t("Amount to refund now", "এখন যত টাকা ফেরত দিচ্ছেন")} required error={tooMuch ? t(`Only ${taka(owed)} is still owed.`, `মাত্র ${taka(owed)} বাকি আছে।`) : undefined}>
          <MoneyInput autoFocus value={f.amount} onChange={(v) => setF({ ...f, amount: v })} className="h-12 text-lg" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Date", "তারিখ")} required><Input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={t("Paid from", "যে হিসাব থেকে")} required><CashSelect value={f.paid_from} onChange={(v) => setF((s) => ({ ...s, paid_from: v }))} /></Field>
          <Field label={t("Cheque / reference", "চেক / রেফারেন্স")} className="sm:col-span-2"><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

/* ---------- paid / overdue / remaining in one bar ---------- */
export function PaidBar({ paid, overdue = 0, total, height = 8, delay = 0, className }: {
  paid: number; overdue?: number; total: number; height?: number; delay?: number; className?: string;
}) {
  const safe = total > 0 ? total : 1;
  const wPaid = Math.max(0, Math.min(100, (paid / safe) * 100));
  const wOver = Math.max(0, Math.min(100 - wPaid, (overdue / safe) * 100));
  return (
    <div className={cn("flex w-full overflow-hidden rounded-full bg-paper-deep", className)} style={{ height }}>
      <motion.div className="h-full bg-leaf" initial={{ width: 0 }} animate={{ width: `${wPaid}%` }} transition={{ duration: 0.9, ease, delay }} />
      <motion.div className="hatch h-full bg-rose" initial={{ width: 0 }} animate={{ width: `${wOver}%` }} transition={{ duration: 0.7, ease, delay: delay + 0.25 }} />
    </div>
  );
}
