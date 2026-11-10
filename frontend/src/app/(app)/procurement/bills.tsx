"use client";

import { Banknote, CircleAlert, Plus, ReceiptText, ShieldHalf, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Chevron, Collapse } from "@/components/finance-parts";
import { CashSelect, LineItems, ProjectSelect, StatusBadge, VoidModal, emptyLine, lineTotal, linesPayload, useLabel, type LineDraft } from "@/components/forms";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, MoneyInput, Select, Skeleton, cn, ease, useAction } from "@/components/ui";
import { api, qs, refreshAll, useList } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { daysFromToday, num, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Vendor, VendorBill, VendorPayment, WorkPackage } from "@/lib/types";

export function Bills() {
  const { t } = useT();
  const { can } = useAuth();
  const [filter, setFilter] = useState({ project: "", vendor: "", status: "POSTED", unpaid: false });
  const { rows: vendors } = useList<Vendor>("/vendors");
  const { rows, loading } = useList<VendorBill>(`/vendor-bills${qs({ page_size: 200, project: filter.project, vendor: filter.vendor, status: filter.status })}`);
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<VendorBill | null>(null);
  const [voidBill, setVoidBill] = useState<VendorBill | null>(null);
  const [voidPay, setVoidPay] = useState<VendorPayment | null>(null);

  const shown = filter.unpaid ? rows.filter((b) => num(b.outstanding) > 0 || num(b.retention_outstanding) > 0) : rows;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-48"><ProjectSelect value={filter.project} onChange={(v) => setFilter({ ...filter, project: v })} all={t("All projects", "সব প্রজেক্ট")} /></div>
        <div className="w-52">
          <Select value={filter.vendor} onChange={(e) => setFilter({ ...filter, vendor: e.target.value })}>
            <option value="">{t("All vendors", "সব সরবরাহকারী")}</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </div>
        <div className="w-36">
          <Select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="POSTED">{t("Posted", "পোস্টেড")}</option>
            <option value="VOIDED">{t("Voided", "বাতিল")}</option>
            <option value="">{t("All", "সব")}</option>
          </Select>
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-card px-3 text-sm">
          <input type="checkbox" className="accent-brick" checked={filter.unpaid} onChange={(e) => setFilter({ ...filter, unpaid: e.target.checked })} />
          {t("Unpaid only", "শুধু অপরিশোধিত")}
        </label>
        {can(ROLES.BUYING) && <Button className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>{t("New bill", "নতুন বিল")}</Button>}
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : shown.length === 0 ? (
        <Card><Empty icon={<ReceiptText />} title={t("No bills match", "কোনো বিল পাওয়া যায়নি")} hint={t("Change the filters, or record what a vendor has billed.", "ফিল্টার বদলান, অথবা সরবরাহকারীর বিল রেকর্ড করুন।")} /></Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {shown.map((b, i) => <BillRow key={b.id} b={b} index={i} onPay={() => setPaying(b)} onVoid={() => setVoidBill(b)} onVoidPayment={setVoidPay} />)}
          </AnimatePresence>
        </div>
      )}

      <BillModal open={creating} onClose={() => setCreating(false)} />
      <PayModal bill={paying} onClose={() => setPaying(null)} />
      <VoidModal open={!!voidBill} onClose={() => setVoidBill(null)} title={t(`Void bill ${voidBill?.number ?? ""}`, `বিল ${voidBill?.number ?? ""} বাতিল`)}
        onConfirm={(reason) => api.post(`/vendor-bills/${voidBill!.id}/void`, { reason })} />
      <VoidModal open={!!voidPay} onClose={() => setVoidPay(null)} title={t(`Void payment ${voidPay?.number ?? ""}`, `পেমেন্ট ${voidPay?.number ?? ""} বাতিল`)}
        onConfirm={(reason) => api.post(`/vendor-payments/${voidPay!.id}/void`, { reason })} />
    </div>
  );
}

function BillRow({ b, index, onPay, onVoid, onVoidPayment }: { b: VendorBill; index: number; onPay: () => void; onVoid: () => void; onVoidPayment: (p: VendorPayment) => void }) {
  const { t, taka, date, n } = useT();
  const { can } = useAuth();
  const label = useLabel();
  const [open, setOpen] = useState(false);
  const voided = b.status === "VOIDED";
  const net = num(b.net_payable), paid = num(b.paid_amount), out = num(b.outstanding), ret = num(b.retention_amount), retOut = num(b.retention_outstanding);
  const days = daysFromToday(b.due_date);
  const late = !voided && out > 0 && days !== null && days < 0;
  const canFinance = can(ROLES.FINANCE);
  const settled = !voided && out === 0 && retOut === 0;

  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease, delay: Math.min(index, 10) * 0.03 }}>
      <Card className={cn("overflow-hidden transition-shadow hover:shadow-lift", voided && "opacity-60")}>
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.25fr_1.5fr_auto] lg:items-center">
          <button type="button" onClick={() => setOpen((s) => !s)} className="flex min-w-0 items-start gap-3 text-left">
            <span className={cn("mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl", settled ? "bg-leaf-wash text-leaf" : late ? "bg-rose-wash text-rose" : "bg-brick-wash text-brick-deep")}><ReceiptText className="size-5" /></span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn("tnum text-[11px] font-semibold uppercase tracking-[0.12em] text-brick", voided && "line-through")}>{b.number}</span>
                <StatusBadge group="bill" value={b.kind} dot={false} />
                {voided && <StatusBadge group="doc" value="VOIDED" />}
              </span>
              <span className="mt-0.5 block truncate text-[15px] font-semibold">{b.vendor_name}</span>
              <span className="block truncate text-xs text-mute">{b.project_code}{b.work_package_name ? ` · ${b.work_package_name}` : ""}{b.reference ? ` · ${b.reference}` : ""} · {date(b.bill_date)}</span>
            </span>
            <Chevron open={open} className="ml-auto mt-1" />
          </button>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-mute">{t("Paid", "পরিশোধ")} <b className="tnum text-ink">{taka(paid)}</b> / <span className="tnum">{taka(net)}</span></span>
              {out > 0 ? <span className={cn("tnum font-semibold", late && "text-rose")}>{t("Due", "বাকি")} {taka(out)}</span> : !voided && <span className="font-medium text-leaf">{t("Paid in full", "সম্পূর্ণ পরিশোধিত")}</span>}
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-paper-deep">
              <motion.div className={cn("h-full rounded-full", late ? "bg-rose" : "bg-leaf")} initial={{ width: 0 }} animate={{ width: `${net ? (paid / net) * 100 : 0}%` }} transition={{ duration: 0.8, ease, delay: 0.1 }} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-mute">
              <span>{t("Gross", "মোট বিল")} <b className="tnum font-medium text-ink-soft">{taka(b.gross_amount)}</b></span>
              {ret > 0 && <span className="flex items-center gap-1"><ShieldHalf className="size-3.5" />{t("Retention held", "জামানত আটকে")} <b className="tnum font-medium text-ink-soft">{taka(retOut)}</b>{retOut < ret && <span>/ {taka(ret)}</span>}</span>}
              {b.due_date && out > 0 && <span className={cn(late && "font-medium text-rose")}>{late ? t(`${-days!} days late`, `${n(-days!)} দিন দেরি`) : `${t("due", "শেষ তারিখ")} ${date(b.due_date)}`}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 lg:justify-end">
            {!voided && canFinance && (out > 0 || retOut > 0) && <Button size="sm" icon={<Banknote className="size-4" />} onClick={onPay}>{t("Pay", "পরিশোধ")}</Button>}
            {!voided && canFinance && <Button size="sm" variant="ghost" onClick={onVoid} disabled={paid > 0 || num(b.retention_released) > 0} title={paid > 0 ? t("Void its payments first", "আগে পেমেন্টগুলো বাতিল করুন") : undefined}>{t("Void", "বাতিল")}</Button>}
          </div>
        </div>

        <Collapse open={open}>
          <div className="grid gap-5 border-t border-line bg-paper/60 p-4 sm:p-5 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{t("What was billed", "যা বিল হয়েছে")}</div>
              <ul className="divide-y divide-line/70 text-[13px]">
                {b.lines.map((l) => (
                  <li key={l.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0"><span className="block truncate">{l.description || l.cost_head_name}</span><span className="text-xs text-mute">{l.cost_head_code} · {l.cost_head_name}{num(l.rate) > 0 ? ` · ${n(l.quantity, num(l.quantity) % 1 ? 2 : 0)} ${l.unit} × ${taka(l.rate)}` : ""}</span></span>
                    <span className="tnum whitespace-nowrap font-medium">{taka(l.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mute">
                <span>{t("Voucher", "ভাউচার")} <b className="tnum text-ink-soft">{b.journal_number}</b></span>
                {b.po_number && <span>{t("From order", "অর্ডার থেকে")} <b className="tnum text-ink-soft">{b.po_number}</b></span>}
                {b.notes && <span>{b.notes}</span>}
                {voided && b.void_reason && <span className="text-rose">{t("Void reason", "বাতিলের কারণ")}: {b.void_reason}</span>}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{t("Payments", "পেমেন্ট")}</div>
              {b.payments.length === 0 ? <p className="text-sm text-mute">{t("No payment made yet.", "এখনো কোনো পেমেন্ট হয়নি।")}</p> : (
                <ul className="space-y-2">
                  {b.payments.map((p) => (
                    <li key={p.id} className={cn("flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2 text-[13px]", p.status === "VOIDED" && "opacity-55")}>
                      <span className="min-w-0 flex-1">
                        <span className={cn("tnum font-medium", p.status === "VOIDED" && "line-through")}>{p.number}</span>
                        <span className="ml-2 text-xs text-mute">{date(p.date)} · {p.paid_from_name}{p.reference ? ` · ${p.reference}` : ""}</span>
                        {p.kind === "RETENTION" && <Badge tone="brass" className="ml-2">{t("Retention", "জামানত")}</Badge>}
                        {p.status === "VOIDED" && <span className="ml-2 text-xs text-rose">{label("doc", "VOIDED")}{p.void_reason ? `: ${p.void_reason}` : ""}</span>}
                      </span>
                      <span className={cn("tnum font-semibold", p.status === "VOIDED" && "line-through")}>{taka(p.amount)}</span>
                      {p.status === "POSTED" && canFinance && !voided && (
                        <button onClick={() => onVoidPayment(p)} title={t("Void payment", "পেমেন্ট বাতিল")} aria-label={t("Void payment", "পেমেন্ট বাতিল")} className="grid size-7 place-items-center rounded-lg text-mute transition hover:bg-rose-wash hover:text-rose"><Undo2 className="size-3.5" /></button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Collapse>
      </Card>
    </motion.div>
  );
}

function BillModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, taka, pct } = useT();
  const { busy, error, run, setError } = useAction();
  const { rows: vendors } = useList<Vendor>("/vendors");
  const [f, setF] = useState({ project: "", vendor: "", work_package: "", kind: "MATERIAL", bill_date: today(), due_date: "", reference: "", retention_amount: "", notes: "" });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const { rows: packages } = useList<WorkPackage>(open && f.project ? `/work-packages?project=${f.project}` : null);

  useEffect(() => {
    if (open) { setF({ project: "", vendor: "", work_package: "", kind: "MATERIAL", bill_date: today(), due_date: "", reference: "", retention_amount: "", notes: "" }); setLines([emptyLine()]); setError(""); }
  }, [open, setError]);

  const wp = packages.find((w) => String(w.id) === f.work_package);
  const gross = lines.reduce((a, l) => a + lineTotal(l), 0);
  const autoRetention = wp ? Math.round(gross * num(wp.retention_percent)) / 100 : 0;
  const retention = f.retention_amount !== "" ? num(f.retention_amount) : autoRetention;
  const payload = linesPayload(lines);
  const valid = f.project && f.vendor && f.bill_date && payload.length > 0 && retention < gross;

  function pickPackage(id: string) {
    const w = packages.find((x) => String(x.id) === id);
    setF((s) => ({
      ...s, work_package: id,
      // A contractor's package implies a contractor bill from that contractor.
      ...(w && w.execution === "CONTRACTOR" ? { kind: "CONTRACTOR", vendor: w.vendor ? String(w.vendor) : s.vendor } : {}),
    }));
    if (w && lines.length === 1 && !lines[0].cost_head) setLines([{ ...lines[0], cost_head: String(w.cost_head) }]);
  }

  async function save() {
    const ok = await run(async () => {
      await api.post("/vendor-bills", {
        project: Number(f.project), vendor: Number(f.vendor), work_package: f.work_package ? Number(f.work_package) : null, kind: f.kind,
        bill_date: f.bill_date, due_date: f.due_date || null, reference: f.reference, notes: f.notes, lines: payload,
        ...(f.retention_amount !== "" ? { retention_amount: f.retention_amount } : {}),
      });
      await refreshAll();
      return true;
    }, t("Bill posted", "বিল পোস্ট হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title={t("New vendor bill", "নতুন বিল")}
      subtitle={t("The cost is recognised today; payment can follow later.", "খরচ আজই হিসাবে ধরা হবে; পরিশোধ পরে করা যাবে।")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button><Button loading={busy} disabled={!valid} onClick={save}>{t("Post bill", "বিল পোস্ট করুন")}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("Project", "প্রজেক্ট")} required><ProjectSelect value={f.project} onChange={(v) => setF({ ...f, project: v, work_package: "" })} /></Field>
          <Field label={t("Work package", "কাজের অংশ")} hint={t("Optional", "ঐচ্ছিক")}>
            <Select value={f.work_package} disabled={!f.project} onChange={(e) => pickPackage(e.target.value)}>
              <option value="">{t("Not linked", "যুক্ত নয়")}</option>
              {packages.map((w) => <option key={w.id} value={w.id}>{w.name}{w.execution === "CONTRACTOR" ? ` · ${w.vendor_name}` : ""}</option>)}
            </Select>
          </Field>
          <Field label={t("Vendor", "সরবরাহকারী")} required>
            <Select value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })}>
              <option value="">{t("Choose vendor", "সরবরাহকারী বাছুন")}</option>
              {vendors.filter((v) => v.is_active || String(v.id) === f.vendor).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <Field label={t("Bill type", "বিলের ধরন")}>
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="MATERIAL">{t("Material", "মালামাল")}</option>
              <option value="CONTRACTOR">{t("Contractor running bill", "ঠিকাদারের চলতি বিল")}</option>
              <option value="LABOUR">{t("Labour", "লেবার")}</option>
              <option value="SERVICE">{t("Service / fee", "সেবা / ফি")}</option>
            </Select>
          </Field>
          <Field label={t("Bill date", "বিলের তারিখ")} required><Input type="date" value={f.bill_date} onChange={(e) => setF({ ...f, bill_date: e.target.value })} /></Field>
          <Field label={t("Payment due", "পরিশোধের শেষ তারিখ")}><Input type="date" value={f.due_date} min={f.bill_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          <Field label={t("Vendor's invoice no.", "সরবরাহকারীর ইনভয়েস নং")}><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
          <Field label={t("Notes", "নোট")}><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>

        {wp && wp.execution === "CONTRACTOR" && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={cn("flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px]", num(wp.billed) + gross > num(wp.budget) ? "bg-rose-wash text-rose" : "bg-sky-wash text-sky")}>
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{t(`Contract value ${taka(wp.budget)} · already billed ${taka(wp.billed)} · room left ${taka(num(wp.budget) - num(wp.billed))}.`, `চুক্তিমূল্য ${taka(wp.budget)} · এ পর্যন্ত বিল ${taka(wp.billed)} · বাকি সুযোগ ${taka(num(wp.budget) - num(wp.billed))}।`)}</span>
          </motion.div>
        )}

        <LineItems lines={lines} onChange={setLines} />

        <div className="grid gap-4 rounded-2xl bg-paper-deep/60 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label={t("Retention held back", "আটকে রাখা জামানত")}
            hint={wp ? t(`Leave blank to hold the package's ${pct(wp.retention_percent, 1)} = ${taka(autoRetention, 2)}.`, `ফাঁকা রাখলে কাজের অংশের ${pct(wp.retention_percent, 1)} = ${taka(autoRetention, 2)} আটকে থাকবে।`) : t("Leave blank for none.", "না থাকলে ফাঁকা রাখুন।")}
            error={retention >= gross && gross > 0 ? t("Retention must be less than the bill.", "জামানত বিলের চেয়ে কম হতে হবে।") : undefined} className="max-w-xs">
            <MoneyInput value={f.retention_amount} onChange={(v) => setF({ ...f, retention_amount: v })} placeholder={autoRetention ? String(autoRetention) : "0"} />
          </Field>
          <div className="space-y-1 text-sm sm:min-w-64">
            <div className="flex justify-between gap-6"><span className="text-mute">{t("Gross bill", "মোট বিল")}</span><span className="tnum font-medium">{taka(gross, 2)}</span></div>
            <div className="flex justify-between gap-6"><span className="text-mute">{t("Less retention", "বাদ জামানত")}</span><span className="tnum font-medium">− {taka(retention, 2)}</span></div>
            <div className="flex justify-between gap-6 border-t border-line pt-1.5 text-base"><span className="font-medium">{t("Payable now", "এখন পরিশোধযোগ্য")}</span><span className="tnum font-bold">{taka(Math.max(gross - retention, 0), 2)}</span></div>
          </div>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function PayModal({ bill, onClose }: { bill: VendorBill | null; onClose: () => void }) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const [f, setF] = useState({ kind: "BILL", date: today(), amount: "", paid_from: "", reference: "", note: "" });
  useEffect(() => {
    if (bill) { setF({ kind: num(bill.outstanding) > 0 ? "BILL" : "RETENTION", date: today(), amount: "", paid_from: "", reference: "", note: "" }); setError(""); }
  }, [bill, setError]);

  const owed = bill ? num(f.kind === "RETENTION" ? bill.retention_outstanding : bill.outstanding) : 0;
  const amount = num(f.amount);
  const tooMuch = amount > owed + 0.001;

  async function save() {
    if (!bill) return;
    const ok = await run(async () => {
      await api.post(`/vendor-bills/${bill.id}/pay`, { kind: f.kind, date: f.date, amount: f.amount, paid_from: Number(f.paid_from), reference: f.reference, note: f.note });
      await refreshAll();
      return true;
    }, t("Payment recorded", "পেমেন্ট রেকর্ড হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={!!bill} onClose={onClose} title={t("Pay vendor", "সরবরাহকারীকে পরিশোধ")} subtitle={bill && `${bill.vendor_name} · ${bill.number}`}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button><Button loading={busy} disabled={!amount || tooMuch || !f.paid_from} onClick={save}>{t("Record payment", "পেমেন্ট সেভ করুন")}</Button></>}>
      {bill && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-paper-deep/60 p-1.5">
            {([["BILL", t("Bill payment", "বিল পরিশোধ"), bill.outstanding], ["RETENTION", t("Release retention", "জামানত ছাড়"), bill.retention_outstanding]] as const).map(([id, label, value]) => (
              <button key={id} type="button" disabled={num(value) <= 0} onClick={() => setF({ ...f, kind: id, amount: "" })}
                className={cn("rounded-xl px-3 py-2.5 text-left transition disabled:opacity-40", f.kind === id ? "bg-ink text-paper shadow-card" : "text-ink-soft hover:bg-card")}>
                <div className="text-sm font-medium">{label}</div>
                <div className={cn("tnum text-xs", f.kind === id ? "text-paper/70" : "text-mute")}>{t("Outstanding", "বাকি")} {taka(value)}</div>
              </button>
            ))}
          </div>
          <Field label={t("Amount", "টাকা")} required error={tooMuch ? t(`Only ${taka(owed)} is outstanding.`, `মাত্র ${taka(owed)} বাকি আছে।`) : undefined}>
            <MoneyInput autoFocus value={f.amount} onChange={(v) => setF({ ...f, amount: v })} className="h-12 text-lg" />
          </Field>
          {owed > 0 && (
            <div className="-mt-1 flex flex-wrap gap-2">
              <button type="button" onClick={() => setF({ ...f, amount: String(owed) })} className="rounded-full border border-line bg-card px-3 py-1 text-xs font-medium transition hover:border-ink hover:bg-brass-wash">
                {f.kind === "RETENTION" ? t("Full retention", "পুরো জামানত") : t("Full outstanding", "পুরো বাকি")} · <span className="tnum">{taka(owed)}</span>
              </button>
              {owed >= 2 && <button type="button" onClick={() => setF({ ...f, amount: String(Math.round(owed / 2)) })} className="rounded-full border border-line bg-card px-3 py-1 text-xs font-medium transition hover:border-ink hover:bg-brass-wash">{t("Half", "অর্ধেক")} · <span className="tnum">{taka(Math.round(owed / 2))}</span></button>}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Date", "তারিখ")} required><Input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label={t("Paid from", "যে হিসাব থেকে")} required><CashSelect value={f.paid_from} onChange={(v) => setF((s) => ({ ...s, paid_from: v }))} /></Field>
            <Field label={t("Cheque / reference", "চেক / রেফারেন্স")}><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
            <Field label={t("Note", "নোট")}><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          </div>
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Modal>
  );
}
