"use client";

import {
  ArrowLeft, ArrowLeftRight, Ban, CalendarClock, Check, CircleAlert, Clock, HandCoins, KeyRound, Phone, Printer, ReceiptText, Search, Undo2,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CashSelect, ReceiptSlip, ReceiveModal, StatusBadge, VoidModal, useLabel } from "@/components/forms";
import { DEAL_ROLES, RefundModal, useDebounced, useOnOpen } from "@/components/sales-parts";
import { Guard, Page } from "@/components/shell";
import {
  Avatar, Bar, Button, Card, CountUp, Empty, ErrorNote, Field, Input, KeyValue, Modal, MoneyInput, PageLoading, Ring, SectionTitle, Textarea,
  cn, ease, rise, useAction,
} from "@/components/ui";
import { api, qs, refreshAll, useApi, useList } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { daysFromToday, num, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { BookingDetail, Customer, Installment, Receipt } from "@/lib/types";

type State = Installment["state"] | "VOID";
const STATE_STYLE: Record<State, { fill: string; node: string; text: string }> = {
  PAID: { fill: "var(--color-leaf)", node: "bg-leaf text-white", text: "text-leaf" },
  PARTIAL: { fill: "var(--color-brass)", node: "bg-brass text-ink", text: "text-[#8a6410]" },
  DUE: { fill: "var(--color-line)", node: "bg-paper-deep text-mute border border-line", text: "text-mute" },
  OVERDUE: { fill: "var(--color-rose)", node: "bg-rose text-white", text: "text-rose" },
  VOID: { fill: "var(--color-paper-deep)", node: "bg-paper-deep text-mute border border-dashed border-line", text: "text-mute" },
};

export default function BookingView() {
  return <Guard roles={ROLES.SALES_TEAM}><Statement /></Guard>;
}

function Statement() {
  const { id } = useParams<{ id: string }>();
  const { t, taka, short, date, pct, n } = useT();
  const label = useLabel();
  const { can } = useAuth();
  const { data: b, error } = useApi<BookingDetail>(`/bookings/${id}`);
  const [receive, setReceive] = useState(false);
  const [slip, setSlip] = useState<Receipt | null>(null);
  const [voiding, setVoiding] = useState<Receipt | null>(null);
  const [modal, setModal] = useState<"transfer" | "cancel" | "handover" | "refund" | null>(null);
  const [fullSchedule, setFullSchedule] = useState(false);

  const back = <Link href="/bookings" className="flex items-center gap-1.5 hover:underline"><ArrowLeft className="size-3.5" />{t("Bookings", "বুকিং")}</Link>;
  if (error) return <Page eyebrow={back} title={t("Booking not found", "বুকিং পাওয়া যায়নি")}><Card><Empty icon={<CircleAlert />} title={error.message} /></Card></Page>;
  if (!b) return <Page eyebrow={back} title={t("Booking", "বুকিং")}><PageLoading /></Page>;

  const finance = can(ROLES.FINANCE);
  const deal = can(DEAL_ROLES);
  const active = b.status === "ACTIVE";
  const cancelled = b.status === "CANCELLED";
  const contract = num(b.contract_value), paid = num(b.paid), outstanding = num(b.outstanding), overdue = num(b.overdue);
  const share = contract ? (paid / contract) * 100 : 0;
  const stateOf = (i: Installment): State => (cancelled && i.state !== "PAID" ? "VOID" : i.state);
  const next = cancelled ? undefined : b.installments.find((i) => num(i.outstanding) > 0);
  const nextDays = daysFromToday(next?.due_date);
  const counts = b.installments.reduce((a, i) => ({ ...a, [stateOf(i)]: (a[stateOf(i)] ?? 0) + 1 }), {} as Record<State, number>);
  const posted = b.receipts.filter((r) => r.status === "POSTED");

  // Long schedules open on what matters now: recent payments, anything late, and what is coming next.
  const firstOpen = b.installments.findIndex((i) => num(i.outstanding) > 0);
  const focus = cancelled
    ? b.installments.filter((i) => i.state === "PAID" || num(i.paid_amount) > 0)
    : b.installments.filter((i, idx) => firstOpen === -1 ? idx >= b.installments.length - 6 : (idx >= firstOpen - 3 && idx < firstOpen + 7) || i.state === "OVERDUE" || i.state === "PARTIAL");
  const collapsible = b.installments.length > 12 || (cancelled && focus.length < b.installments.length);
  const shown = fullSchedule || !collapsible ? b.installments : focus;
  const hidden = b.installments.length - shown.length;
  const hiddenUnpaid = b.installments.filter((i) => !shown.includes(i)).reduce((a, i) => a + num(i.outstanding), 0);

  return (
    <Page
      eyebrow={<>{back}<span className="text-mute">/</span><span className="tnum">{b.number}</span></>}
      title={<span className="flex flex-wrap items-center gap-3">{b.customer_name}<StatusBadge group="booking" value={b.status} /></span>}
      subtitle={<>{b.project_name} · {t("Flat", "ফ্ল্যাট")} <b className="text-ink">{b.flat_code}</b> · <span className="tnum">{num(b.flat_size).toFixed(0)} sft</span></>}
      actions={<>
        <Button variant="ghost" icon={<Printer className="size-4" />} onClick={() => window.print()}>{t("Print", "প্রিন্ট")}</Button>
        {deal && active && <Button variant="ghost" icon={<Ban className="size-4" />} className="text-rose hover:bg-rose-wash" onClick={() => setModal("cancel")}>{t("Cancel sale", "বিক্রি বাতিল")}</Button>}
        {deal && active && <Button variant="outline" icon={<ArrowLeftRight className="size-4" />} onClick={() => setModal("transfer")}>{t("Transfer", "নাম পরিবর্তন")}</Button>}
        {deal && active && <Button variant="outline" icon={<KeyRound className="size-4" />} onClick={() => setModal("handover")}>{t("Hand over", "হস্তান্তর")}</Button>}
        {finance && !cancelled && outstanding > 0 && <Button icon={<HandCoins className="size-4" />} onClick={() => setReceive(true)}>{t("Receive payment", "টাকা গ্রহণ")}</Button>}
      </>}
    >
      {/* ---------- statement hero ---------- */}
      <motion.div variants={rise}>
        <Card className="relative overflow-hidden p-5 sm:p-7">
          <div className="hatch pointer-events-none absolute -right-10 -top-10 size-44 rounded-full opacity-50" />
          <div className="relative grid items-center gap-7 lg:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-6">
              <Ring value={share} size={168} stroke={15} color={cancelled ? "var(--color-mute)" : "var(--color-leaf)"}>
                <div>
                  <CountUp value={share} format={(v) => pct(v)} className="block text-[34px] font-bold leading-none tracking-tight" />
                  <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-mute">{t("paid", "পরিশোধ")}</span>
                </div>
              </Ring>
              <div className="lg:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mute">{t("Contract value", "চুক্তিমূল্য")}</p>
                <p className="tnum text-2xl font-bold">{short(contract)}</p>
              </div>
            </div>
            <div className="min-w-0">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Figure label={t("Contract value", "চুক্তিমূল্য")} value={contract} format={taka} className="hidden lg:block" />
                <Figure label={t("Paid", "পরিশোধিত")} value={paid} format={taka} tone="text-leaf" />
                <Figure label={cancelled ? t("Unpaid at cancellation", "বাতিলের সময় অপরিশোধিত") : t("Still to pay", "এখনো বাকি")} value={cancelled ? contract - paid : outstanding} format={taka} tone={cancelled ? "text-mute" : undefined} />
                <Figure label={t("Overdue", "মেয়াদোত্তীর্ণ")} value={overdue} format={taka} tone={overdue > 0 ? "text-rose" : "text-mute"} />
              </div>

              {/* every installment as one block, sized by its amount */}
              <div className="mt-6">
                <div className="flex h-9 items-end gap-[3px]">
                  {b.installments.map((i, idx) => {
                    const st = stateOf(i);
                    const part = num(i.amount) ? (num(i.paid_amount) / num(i.amount)) * 100 : 0;
                    return (
                      <motion.div key={i.id} title={`${i.title} · ${date(i.due_date)} · ${taka(i.amount)}`}
                        className="relative h-full min-w-[5px] overflow-hidden rounded-[4px]" style={{ flexGrow: Math.max(num(i.amount), 1), background: st === "PARTIAL" ? "var(--color-paper-deep)" : STATE_STYLE[st].fill, transformOrigin: "bottom" }}
                        initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ duration: 0.45, ease, delay: 0.15 + idx * 0.022 }}>
                        {st === "PARTIAL" && <span className="absolute inset-y-0 left-0 bg-brass" style={{ width: `${part}%` }} />}
                        {st === "OVERDUE" && <span className="hatch absolute inset-0 opacity-60" />}
                      </motion.div>
                    );
                  })}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 text-xs text-ink-soft">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {(["PAID", "PARTIAL", "OVERDUE", "DUE", "VOID"] as State[]).filter((s) => counts[s]).map((s) => (
                      <span key={s} className="flex items-center gap-1.5">
                        <i className="size-2.5 rounded-[3px]" style={{ background: STATE_STYLE[s].fill }} />
                        {s === "VOID" ? t("Cancelled", "বাতিল") : label("installment", s)} <b className="tnum text-ink">{n(counts[s])}</b>
                      </span>
                    ))}
                  </div>
                  {next && (
                    <span className={cn("flex items-center gap-1.5 font-medium", nextDays !== null && nextDays < 0 ? "text-rose" : "text-ink")}>
                      <CalendarClock className="size-3.5" />
                      {t("Next due", "পরের কিস্তি")}: <span className="tnum">{taka(next.outstanding)}</span> · {date(next.due_date)}
                      {nextDays !== null && nextDays < 0 && <> · {t(`${-nextDays} days late`, `${n(-nextDays)} দিন দেরি`)}</>}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {b.status === "HANDED_OVER" && (
        <motion.div variants={rise} className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-leaf/30 bg-leaf-wash px-5 py-3.5 text-sm text-leaf">
          <KeyRound className="size-4" /><b>{t("Handed over", "হস্তান্তরিত")}</b> {date(b.handover_date)}
          <span className="text-ink-soft">{outstanding > 0 ? t(`— ${taka(outstanding)} is still receivable from the owner.`, `— মালিকের কাছে এখনো ${taka(outstanding)} পাওনা।`) : t("— fully paid.", "— সম্পূর্ণ পরিশোধিত।")}</span>
        </motion.div>
      )}

      {b.cancellation && (
        <motion.div variants={rise} className="mt-5">
          <Card className="border-rose/30 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-rose"><Ban className="size-4" /><h2 className="text-[15px] font-semibold">{t("Sale cancelled", "বিক্রি বাতিল")} · {date(b.cancellation.date)}</h2></div>
                <p className="mt-1 text-sm text-ink-soft">{b.cancellation.reason}</p>
              </div>
              {finance && num(b.cancellation.refund_outstanding) > 0 && <Button icon={<Undo2 className="size-4" />} onClick={() => setModal("refund")}>{t("Pay refund", "রিফান্ড দিন")}</Button>}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              <Mini label={t("Customer had paid", "ক্রেতা দিয়েছিলেন")} value={taka(b.cancellation.paid_total)} />
              <Mini label={t("Kept by company", "কোম্পানির কর্তন")} value={taka(b.cancellation.deduction)} />
              <Mini label={t("Refund agreed", "নির্ধারিত রিফান্ড")} value={taka(b.cancellation.refund_amount)} />
              <Mini label={t("Refund still owed", "রিফান্ড বাকি")} value={taka(b.cancellation.refund_outstanding)} tone={num(b.cancellation.refund_outstanding) > 0 ? "text-brick" : "text-leaf"} />
            </div>
            {num(b.cancellation.refund_amount) > 0 && <Bar className="mt-4" tone="leaf" value={num(b.cancellation.refunded_amount)} max={num(b.cancellation.refund_amount)} height={10} />}
            {b.cancellation.refunds.length > 0 && (
              <ul className="mt-4 divide-y divide-line/70 text-sm">
                {b.cancellation.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><b className="tnum">{r.number}</b> <span className="text-mute">· {date(r.date)} · {r.paid_from}{r.reference ? ` · ${r.reference}` : ""}</span></span>
                    <span className="tnum font-semibold">{taka(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* ---------- payment timeline ---------- */}
        <motion.div variants={rise}>
          <Card className="p-5 sm:p-6">
            <SectionTitle hint={t("Money received is applied to the oldest unpaid line first.", "প্রাপ্ত টাকা সবচেয়ে পুরোনো অপরিশোধিত কিস্তিতে আগে সমন্বয় হয়।")}
              action={collapsible && (
                <Button size="sm" variant="soft" className="no-print" onClick={() => setFullSchedule((v) => !v)}>
                  {fullSchedule ? t("Show what matters now", "শুধু জরুরি অংশ") : t(`Show all ${b.installments.length}`, `সব ${n(b.installments.length)}টি দেখুন`)}
                </Button>
              )}>{t("Payment schedule", "কিস্তির সময়সূচি")}</SectionTitle>
            <ol className="relative">
              <span className="absolute bottom-4 left-[15px] top-4 w-px bg-line" />
              {shown.map((i, idx) => {
                const st = stateOf(i);
                const style = STATE_STYLE[st];
                const part = num(i.amount) ? (num(i.paid_amount) / num(i.amount)) * 100 : 0;
                const late = st === "OVERDUE" ? daysFromToday(i.due_date) : null;
                return (
                  <motion.li key={i.id} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease, delay: 0.2 + Math.min(idx * 0.028, 0.9) }}
                    className="relative flex items-center gap-3.5 py-2">
                    <span className={cn("relative z-10 grid size-[31px] shrink-0 place-items-center rounded-full text-[11px] font-bold", style.node)}>
                      {st === "PAID" ? <Check className="size-4" /> : st === "OVERDUE" ? <CircleAlert className="size-4" /> : st === "PARTIAL" ? <Clock className="size-4" /> : n(i.sequence)}
                    </span>
                    <div className={cn("flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border px-3.5 py-2.5 transition", st === "OVERDUE" ? "border-rose/30 bg-rose-wash/50" : st === "PARTIAL" ? "border-brass/40 bg-brass-wash/40" : "border-line/70 bg-card", st === "VOID" && "opacity-60")}>
                      <div className="min-w-0">
                        <div className={cn("truncate text-sm font-medium", st === "VOID" && "line-through")}>{i.title}</div>
                        <div className={cn("tnum text-xs", style.text)}>
                          {date(i.due_date)}
                          {late !== null && late < 0 && <> · {t(`${-late} days late`, `${n(-late)} দিন দেরি`)}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {st === "PARTIAL" && (
                          <div className="w-24"><div className="h-1.5 overflow-hidden rounded-full bg-paper-deep"><div className="h-full rounded-full bg-brass" style={{ width: `${part}%` }} /></div>
                            <div className="tnum mt-0.5 text-right text-[11px] text-mute">{t("paid", "পরিশোধ")} {taka(i.paid_amount)}</div></div>
                        )}
                        <div className="text-right">
                          <div className="tnum text-sm font-semibold">{taka(i.amount)}</div>
                          {(st === "OVERDUE" || st === "PARTIAL") && num(i.paid_amount) > 0 && <div className="tnum text-[11px] text-mute">{t("due", "বাকি")} {taka(i.outstanding)}</div>}
                        </div>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
              {hidden > 0 && (
                <li className="relative flex items-center gap-3.5 py-2">
                  <span className="relative z-10 grid size-[31px] shrink-0 place-items-center rounded-full border border-dashed border-line bg-card text-[11px] font-bold text-mute">+{n(hidden)}</span>
                  <button type="button" onClick={() => setFullSchedule(true)} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line px-3.5 py-2.5 text-left text-sm text-ink-soft transition hover:border-ink hover:text-ink">
                    <span>{cancelled ? t(`${hidden} unpaid lines lapsed when the sale was cancelled`, `বিক্রি বাতিল হওয়ায় ${n(hidden)}টি অপরিশোধিত কিস্তি বাতিল`) : t(`${hidden} more lines — show the full schedule`, `আরও ${n(hidden)}টি কিস্তি — পুরো তালিকা দেখুন`)}</span>
                    {!cancelled && hiddenUnpaid > 0 && <span className="tnum font-medium">{taka(hiddenUnpaid)}</span>}
                  </button>
                </li>
              )}
            </ol>
          </Card>
        </motion.div>

        {/* ---------- facts ---------- */}
        <div className="space-y-5">
          <motion.div variants={rise}>
            <Card className="p-5 sm:p-6">
              <SectionTitle>{t("Contract", "চুক্তি")}</SectionTitle>
              <div className="divide-y divide-line/60">
                <KeyValue label={t("Land share", "জমির অংশ")}>{taka(b.land_price)}</KeyValue>
                <KeyValue label={t("Construction", "নির্মাণ")}>{taka(b.construction_price)}</KeyValue>
                <KeyValue label={t("Parking, utility & other", "পার্কিং, ইউটিলিটি ও অন্যান্য")}>{taka(b.other_charges)}</KeyValue>
                {num(b.discount) > 0 && <KeyValue label={t("Discount", "ছাড়")}><span className="text-leaf">−{taka(b.discount)}</span></KeyValue>}
                <KeyValue label={t("Price at signing", "স্বাক্ষরের সময় দাম")}>{taka(b.total_price)}</KeyValue>
                {num(b.revision_amount) > 0 && <KeyValue label={t("Agreed price revisions", "সম্মত মূল্য সংশোধন")}><span className="text-brick">+{taka(b.revision_amount)}</span></KeyValue>}
              </div>
              <div className="mt-3 flex items-baseline justify-between rounded-xl bg-night px-4 py-3 text-paper">
                <span className="text-sm text-paper/60">{t("Contract value", "চুক্তিমূল্য")}</span>
                <span className="tnum text-xl font-bold">{taka(b.contract_value)}</span>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={rise}>
            <Card className="p-5 sm:p-6">
              <div className="flex items-center gap-3.5">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-ink text-lg font-bold text-paper">{b.flat_code}</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brick">{b.project_code}</div>
                  <div className="truncate font-semibold">{b.project_name}</div>
                </div>
              </div>
              <div className="mt-3 divide-y divide-line/60">
                <KeyValue label={t("Type", "ধরন")}>{b.flat_detail.flat_type || "—"}{b.flat_detail.bedrooms ? ` · ${n(b.flat_detail.bedrooms)} ${t("bed", "বেড")}` : ""}</KeyValue>
                <KeyValue label={t("Size", "আয়তন")}>{n(b.flat_detail.size_sqft)} sft</KeyValue>
                <KeyValue label={t("Floor · facing", "তলা · মুখ")}>{n(b.flat_detail.floor)}{b.flat_detail.facing ? ` · ${b.flat_detail.facing}` : ""}</KeyValue>
                <KeyValue label={t("Land share", "জমির অংশ")}>{n(b.flat_detail.land_share_katha, 4)} {t("katha", "কাঠা")}</KeyValue>
                <KeyValue label={t("Booked on", "বুকিংয়ের তারিখ")}>{date(b.booking_date)}</KeyValue>
                <KeyValue label={t("Promised handover", "প্রতিশ্রুত হস্তান্তর")}>{date(b.expected_handover)}</KeyValue>
                <KeyValue label={t("Sold by", "বিক্রেতা")}>{b.sales_person_name || "—"}</KeyValue>
              </div>
              {b.notes && <p className="mt-3 rounded-xl bg-paper-deep/70 px-3.5 py-2.5 text-[13px] text-ink-soft">{b.notes}</p>}
            </Card>
          </motion.div>

          <motion.div variants={rise}>
            <Card className="p-5 sm:p-6">
              <div className="flex items-center gap-3.5">
                <Avatar name={b.customer_name} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{b.customer_name}</div>
                  <a href={`tel:${b.customer_phone}`} className="tnum flex items-center gap-1.5 text-sm text-ink-soft hover:text-brick"><Phone className="size-3.5" />{b.customer_phone}</a>
                </div>
              </div>
              <div className="mt-3 divide-y divide-line/60">
                <KeyValue label={t("National ID", "এনআইডি")}>{b.customer_detail.nid || "—"}</KeyValue>
                <KeyValue label={t("Address", "ঠিকানা")}>{b.customer_detail.address || "—"}</KeyValue>
                <KeyValue label={t("Nominee", "নমিনি")}>{b.customer_detail.nominee_name ? `${b.customer_detail.nominee_name}${b.customer_detail.nominee_relation ? ` (${b.customer_detail.nominee_relation})` : ""}` : "—"}</KeyValue>
              </div>
              {b.transfers.length > 0 && (
                <div className="mt-4 border-t border-dashed border-line pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">{t("Ownership history", "মালিকানার ইতিহাস")}</p>
                  <ul className="space-y-2 text-[13px]">
                    {b.transfers.map((tr) => (
                      <li key={tr.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <ArrowLeftRight className="size-3.5 text-brick" />
                        <span>{tr.from} → <b>{tr.to}</b></span>
                        <span className="tnum text-mute">· {date(tr.date)}{num(tr.fee) > 0 ? ` · ${t("fee", "ফি")} ${taka(tr.fee)}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </motion.div>
        </div>
      </div>

      {/* ---------- receipts ---------- */}
      <motion.div variants={rise} className="mt-5">
        <Card className="p-5 sm:p-6">
          <SectionTitle hint={t("Click a receipt to view or print it.", "রিসিট দেখতে বা প্রিন্ট করতে ক্লিক করুন।")}
            action={<span className="text-sm text-mute">{n(posted.length)} {t("receipts", "রিসিট")} · <b className="tnum text-ink">{taka(posted.reduce((a, r) => a + num(r.amount), 0))}</b></span>}>
            <span className="flex items-center gap-2"><ReceiptText className="size-4 text-brick" />{t("Money received", "প্রাপ্ত টাকা")}</span>
          </SectionTitle>
          {b.receipts.length === 0 ? <Empty title={t("No payment received yet", "এখনো কোনো টাকা পাওয়া যায়নি")} /> : (
            <ul className="grid gap-2.5 md:grid-cols-2">
              {b.receipts.map((r, i) => {
                const voided = r.status === "VOIDED";
                return (
                  <motion.li key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + Math.min(i * 0.03, 0.5) }}
                    className={cn("group flex items-center gap-3 rounded-xl border px-3.5 py-3 transition hover:shadow-card", voided ? "border-dashed border-line bg-paper-deep/50" : "border-line bg-card hover:border-ink/40")}>
                    <button type="button" onClick={() => setSlip(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", voided ? "bg-paper-deep text-mute" : "bg-leaf-wash text-leaf")}><ReceiptText className="size-[18px]" /></span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("tnum block text-sm font-semibold", voided && "text-mute line-through")}>{r.number}</span>
                        <span className="block truncate text-xs text-mute">{date(r.date)} · {label("method", r.method)}{r.reference ? ` · ${r.reference}` : ""}</span>
                        {voided && <span className="block truncate text-xs text-rose">{t("Voided", "বাতিল")}: {r.void_reason}</span>}
                      </span>
                      <span className={cn("tnum text-[15px] font-semibold", voided && "text-mute line-through")}>{taka(r.amount)}</span>
                    </button>
                    {finance && !voided && !cancelled && (
                      <button type="button" onClick={() => setVoiding(r)} title={t("Void this receipt", "এই রিসিট বাতিল করুন")} aria-label={t("Void this receipt", "এই রিসিট বাতিল করুন")}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-rose-wash hover:text-rose"><Ban className="size-4" /></button>
                    )}
                  </motion.li>
                );
              })}
            </ul>
          )}
        </Card>
      </motion.div>

      <ReceiveModal booking={b} installments={b.installments} open={receive} onClose={() => setReceive(false)} onDone={(r) => r && setSlip(r)} />
      <ReceiptSlip receipt={slip} open={!!slip} onClose={() => setSlip(null)} />
      <VoidModal open={!!voiding} onClose={() => setVoiding(null)} title={t(`Void receipt ${voiding?.number ?? ""}?`, `রিসিট ${voiding?.number ?? ""} বাতিল করবেন?`)}
        hint={t("The installments it paid become unpaid again. Both entries stay in the books.", "এই রিসিটে পরিশোধিত কিস্তিগুলো আবার অপরিশোধিত হবে। দুটি এন্ট্রিই হিসাবে থাকবে।")}
        onConfirm={(reason) => api.post(`/receipts/${voiding!.id}/void`, { reason })} />
      <TransferModal booking={b} open={modal === "transfer"} onClose={() => setModal(null)} />
      <CancelModal booking={b} open={modal === "cancel"} onClose={() => setModal(null)} />
      <HandoverModal booking={b} open={modal === "handover"} onClose={() => setModal(null)} />
      <RefundModal cancellation={b.cancellation} open={modal === "refund"} onClose={() => setModal(null)} />
    </Page>
  );
}

function Figure({ label, value, format, tone, className }: { label: string; value: number; format: (v: number) => string; tone?: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{label}</div>
      <CountUp value={value} format={(v) => format(Math.round(v))} className={cn("mt-1 block text-[22px] font-bold leading-tight tracking-tight", tone)} />
    </div>
  );
}
function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-paper-deep/70 px-3.5 py-2.5">
      <div className="text-xs text-mute">{label}</div>
      <div className={cn("tnum mt-0.5 text-base font-semibold", tone)}>{value}</div>
    </div>
  );
}

/* ---------- transfer to another customer ---------- */
function TransferModal({ booking, open, onClose }: { booking: BookingDetail; open: boolean; onClose: () => void }) {
  const { t } = useT();
  const { busy, error, run, setError } = useAction();
  const [search, setSearch] = useState("");
  const [to, setTo] = useState<Customer | null>(null);
  const [f, setF] = useState({ date: today(), fee: "", fee_account: "", note: "" });
  const q = useDebounced(search.trim(), 250);
  const { rows } = useList<Customer>(open ? `/customers${qs({ search: q, page_size: 12 })}` : null);
  useOnOpen(open, () => {
    setSearch(""); setTo(null); setError("");
    setF({ date: today(), fee: "", fee_account: "", note: "" });
  });

  async function submit() {
    if (!to) return;
    const ok = await run(async () => {
      await api.post(`/bookings/${booking.id}/transfer`, {
        to_customer: to.id, date: f.date, fee: f.fee || "0", fee_account: num(f.fee) > 0 && f.fee_account ? Number(f.fee_account) : null, note: f.note,
      });
      await refreshAll();
      return true;
    }, t("Booking transferred", "বুকিং হস্তান্তরিত হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Transfer to another customer", "অন্য ক্রেতার নামে পরিবর্তন")}
      subtitle={t(`${booking.number} currently belongs to ${booking.customer_name}. Payments made so far stay with the booking.`, `${booking.number} এখন ${booking.customer_name}-এর নামে। এ পর্যন্ত দেওয়া টাকা বুকিংয়ের সাথেই থাকবে।`)}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!to || (num(f.fee) > 0 && !f.fee_account)} onClick={submit}>{t("Transfer booking", "নাম পরিবর্তন করুন")}</Button>
      </>}>
      <div className="space-y-4">
        {to ? (
          <div className="flex items-center gap-3 rounded-2xl border-2 border-leaf bg-leaf-wash/60 p-3.5">
            <Avatar name={to.name} size={40} />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{to.name}</div><div className="tnum text-xs text-ink-soft">{to.phone}</div></div>
            <Button size="sm" variant="ghost" onClick={() => setTo(null)}>{t("Change", "বদলান")}</Button>
          </div>
        ) : (
          <Field label={t("New owner", "নতুন মালিক")} required hint={t("Add the person under Customers first if they are not listed.", "তালিকায় না থাকলে আগে ক্রেতা হিসেবে যোগ করুন।")}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
              <Input autoFocus className="pl-9" placeholder={t("Search by name or phone", "নাম বা ফোন দিয়ে খুঁজুন")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <ul className="scroll-thin mt-2 max-h-52 divide-y divide-line/60 overflow-y-auto rounded-xl border border-line">
              {rows.filter((c) => c.id !== booking.customer).map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setTo(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-brass-wash/60">
                    <Avatar name={c.name} size={30} /><span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span><span className="tnum text-xs text-mute">{c.phone}</span>
                  </button>
                </li>
              ))}
              {rows.length === 0 && <li className="px-3 py-4 text-center text-sm text-mute">{t("No customer found", "কোনো ক্রেতা পাওয়া যায়নি")}</li>}
            </ul>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Transfer date", "পরিবর্তনের তারিখ")} required><Input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={t("Transfer fee", "নাম পরিবর্তন ফি")} hint={t("Leave empty if no fee is charged.", "ফি না থাকলে ফাঁকা রাখুন।")}><MoneyInput value={f.fee} onChange={(v) => setF({ ...f, fee: v })} /></Field>
          {num(f.fee) > 0 && <Field label={t("Fee received into", "ফি যে হিসাবে জমা")} required><CashSelect value={f.fee_account} onChange={(v) => setF((s) => ({ ...s, fee_account: v }))} /></Field>}
          <Field label={t("Note", "নোট")} className={num(f.fee) > 0 ? "" : "sm:col-span-2"}><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

/* ---------- cancel the sale ---------- */
function CancelModal({ booking, open, onClose }: { booking: BookingDetail; open: boolean; onClose: () => void }) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const [f, setF] = useState({ date: today(), reason: "", deduction: "" });
  useOnOpen(open, () => { setF({ date: today(), reason: "", deduction: "" }); setError(""); });
  const paid = num(booking.paid);
  const deduction = num(f.deduction);
  const tooMuch = deduction > paid + 0.001;
  const refund = Math.max(paid - deduction, 0);

  async function submit() {
    const ok = await run(async () => {
      await api.post(`/bookings/${booking.id}/cancel`, { date: f.date, reason: f.reason.trim(), deduction: f.deduction || "0" });
      await refreshAll();
      return true;
    }, t("Booking cancelled", "বুকিং বাতিল হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Cancel this sale", "এই বিক্রি বাতিল করুন")}
      subtitle={t(`Flat ${booking.flat_code} becomes available again. This cannot be undone.`, `ফ্ল্যাট ${booking.flat_code} আবার খালি হবে। এটি আর ফেরানো যাবে না।`)}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Keep the booking", "বুকিং থাক")}</Button>
        <Button variant="danger" loading={busy} disabled={!f.reason.trim() || tooMuch} onClick={submit}>{t("Cancel sale", "বিক্রি বাতিল করুন")}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 items-stretch gap-2 text-center">
          <div className="rounded-2xl bg-paper-deep/70 px-3 py-3"><div className="text-xs text-mute">{t("Customer has paid", "ক্রেতা দিয়েছেন")}</div><div className="tnum mt-1 text-lg font-bold">{taka(paid)}</div></div>
          <div className="rounded-2xl bg-brass-wash px-3 py-3"><div className="text-xs text-[#8a6410]">{t("Company keeps", "কোম্পানি রাখবে")}</div><motion.div key={deduction} initial={{ scale: 0.92 }} animate={{ scale: 1 }} className="tnum mt-1 text-lg font-bold">{taka(Math.min(deduction, paid))}</motion.div></div>
          <div className="rounded-2xl bg-night px-3 py-3 text-paper"><div className="text-xs text-paper/55">{t("To be refunded", "ফেরত দিতে হবে")}</div><motion.div key={refund} initial={{ scale: 0.92 }} animate={{ scale: 1 }} className="tnum mt-1 text-lg font-bold text-brass">{taka(refund)}</motion.div></div>
        </div>
        <Field label={t("Deduction (amount kept by the company)", "কর্তন (কোম্পানি যত টাকা রাখবে)")} error={tooMuch ? t(`Cannot be more than what was paid (${taka(paid)}).`, `পরিশোধিত টাকার (${taka(paid)}) চেয়ে বেশি হতে পারবে না।`) : undefined}>
          <MoneyInput value={f.deduction} onChange={(v) => setF({ ...f, deduction: v })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label={t("Cancellation date", "বাতিলের তারিখ")} required><Input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={t("Reason", "কারণ")} required><Textarea autoFocus value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder={t("Why is the sale being cancelled?", "কেন বিক্রি বাতিল হচ্ছে?")} /></Field>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

/* ---------- hand the flat over ---------- */
function HandoverModal({ booking, open, onClose }: { booking: BookingDetail; open: boolean; onClose: () => void }) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const [date, setDate] = useState(today());
  const [allowDues, setAllowDues] = useState(false);
  useOnOpen(open, () => { setDate(today()); setAllowDues(false); setError(""); });
  const dues = num(booking.outstanding);

  async function submit() {
    const ok = await run(async () => {
      await api.post(`/bookings/${booking.id}/handover`, { date, allow_dues: allowDues });
      await refreshAll();
      return true;
    }, t("Flat handed over", "ফ্ল্যাট হস্তান্তরিত হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t(`Hand over flat ${booking.flat_code}`, `ফ্ল্যাট ${booking.flat_code} হস্তান্তর`)}
      subtitle={t("The sale becomes revenue in the books and this flat's share of project cost is released.", "এই বিক্রি হিসাবে আয় হিসেবে গণ্য হবে এবং প্রজেক্টের খরচ থেকে এই ফ্ল্যাটের অংশ ছাড় হবে।")}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Not yet", "এখন না")}</Button>
        <Button loading={busy} disabled={dues > 0 && !allowDues} icon={<KeyRound className="size-4" />} onClick={submit}>{t("Confirm handover", "হস্তান্তর নিশ্চিত করুন")}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-paper-deep/70 p-4 text-sm">
          <div><div className="text-mute">{t("Contract value", "চুক্তিমূল্য")}</div><div className="tnum text-lg font-semibold">{taka(booking.contract_value)}</div></div>
          <div><div className="text-mute">{t("Still unpaid", "এখনো অপরিশোধিত")}</div><div className={cn("tnum text-lg font-semibold", dues > 0 ? "text-rose" : "text-leaf")}>{taka(dues)}</div></div>
        </div>
        <Field label={t("Handover date", "হস্তান্তরের তারিখ")} required><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
        {dues > 0 ? (
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition", allowDues ? "border-rose bg-rose-wash/60" : "border-line")}>
            <input type="checkbox" checked={allowDues} onChange={(e) => setAllowDues(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-rose)]" />
            <span className="text-sm">
              <b className="block">{t("Hand over with dues", "বকেয়া রেখেই হস্তান্তর")}</b>
              <span className="text-ink-soft">{t(`${taka(dues)} is still unpaid. Ticking this hands the flat over anyway and records that amount as receivable from the owner.`, `${taka(dues)} এখনো অপরিশোধিত। টিক দিলে তবুও হস্তান্তর হবে এবং এই টাকা মালিকের কাছে পাওনা হিসেবে থাকবে।`)}</span>
            </span>
          </label>
        ) : (
          <p className="flex items-center gap-2 rounded-2xl bg-leaf-wash px-4 py-3 text-sm font-medium text-leaf"><Check className="size-4" />{t("Fully paid — ready to hand over.", "সম্পূর্ণ পরিশোধিত — হস্তান্তরের জন্য প্রস্তুত।")}</p>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
