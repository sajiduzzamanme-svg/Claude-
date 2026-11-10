"use client";

import { ArrowUpRight, CircleCheck, HandCoins, Hourglass, Phone, ReceiptText, Undo2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { ProjectSelect, ReceiptSlip, ReceiveModal, useLabel } from "@/components/forms";
import { RefundModal } from "@/components/sales-parts";
import { Guard, Page } from "@/components/shell";
import { Avatar, Bar, Button, Card, CountUp, Empty, SectionTitle, Skeleton, Tabs, cn, ease, rise } from "@/components/ui";
import { qs, useApi, useList } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { BookingDetail, Cancellation, Receipt, Receivables } from "@/lib/types";

type Row = Receivables["rows"][number];
type BucketKey = keyof Receivables["buckets"];

const BUCKETS: { key: BucketKey; en: string; bn: string; color: string; ink: string }[] = [
  { key: "not_due", en: "Not yet due", bn: "এখনো ডিউ হয়নি", color: "#1b8459", ink: "#fff" },
  { key: "d1_30", en: "1–30 days late", bn: "১–৩০ দিন দেরি", color: "#d39a2c", ink: "#161a22" },
  { key: "d31_60", en: "31–60 days", bn: "৩১–৬০ দিন", color: "#d9762b", ink: "#fff" },
  { key: "d61_90", en: "61–90 days", bn: "৬১–৯০ দিন", color: "#c4532f", ink: "#fff" },
  { key: "d90_plus", en: "Over 90 days", bn: "৯০ দিনের বেশি", color: "#8f1f1a", ink: "#fff" },
];

export default function CollectionsPage() {
  return <Guard roles={ROLES.SALES_TEAM}><Collections /></Guard>;
}

function Collections() {
  const { t, short, taka, date, pct, n } = useT();
  const label = useLabel();
  const { can } = useAuth();
  const finance = can(ROLES.FINANCE);
  const [project, setProject] = useState("");
  const [tab, setTab] = useState<"overdue" | "all">("overdue");
  const [target, setTarget] = useState<Row | null>(null);
  const [slip, setSlip] = useState<Receipt | null>(null);
  const [refund, setRefund] = useState<Cancellation | null>(null);

  const { data, error } = useApi<Receivables>(`/reports/receivables${qs({ project })}`);
  const { rows: receipts, loading: receiptsLoading } = useList<Receipt>(`/receipts${qs({ page_size: 30, booking__project: project })}`);
  const { rows: cancellations } = useList<Cancellation>(finance ? `/cancellations${qs({ booking__project: project })}` : null);
  const { data: detail } = useApi<BookingDetail>(target ? `/bookings/${target.booking}` : null);

  const total = num(data?.total);
  const overdue = num(data?.overdue);
  const rows = data?.rows ?? [];
  const late = rows.filter((r) => num(r.overdue) > 0);
  const list = tab === "overdue" ? late : rows;
  const owed = cancellations.filter((c) => num(c.refund_outstanding) > 0);
  const worst = late[0];

  return (
    <Page
      eyebrow={t("Collector's desk", "আদায় ডেস্ক")}
      title={t("Collections", "আদায়")}
      subtitle={t("Who owes what, how late it is, and who to call first.", "কার কাছে কত পাওনা, কত দিন দেরি, আর আগে কাকে ফোন করতে হবে।")}
      actions={<div className="w-60"><ProjectSelect value={project} onChange={setProject} all={t("All projects", "সব প্রজেক্ট")} /></div>}
    >
      {/* ---------- aging strip ---------- */}
      <motion.div variants={rise}>
        <Card className="overflow-hidden p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-mute">{t("Still to collect", "মোট আদায় বাকি")}</p>
              <CountUp value={total} format={short} className="mt-1 block text-[44px] font-bold leading-none tracking-tight" />
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <div>
                <p className="text-xs text-mute">{t("Past its due date", "মেয়াদ পেরিয়েছে")}</p>
                <CountUp value={overdue} format={short} className={cn("block text-2xl font-bold tracking-tight", overdue > 0 ? "text-rose" : "text-leaf")} />
                <p className="tnum text-xs text-mute">{pct(total ? (overdue / total) * 100 : 0, 1)} {t("of the balance", "মোট বাকির")}</p>
              </div>
              <div>
                <p className="text-xs text-mute">{t("Customers behind", "বকেয়া ক্রেতা")}</p>
                <CountUp value={late.length} format={(v) => n(Math.round(v))} className="block text-2xl font-bold tracking-tight" />
                <p className="tnum text-xs text-mute">{t("of", "মোট")} {n(rows.length)} {t("with a balance", "জনের মধ্যে")}</p>
              </div>
            </div>
          </div>

          {!data ? <Skeleton className="mt-6 h-24" /> : (
            <>
              <div className="mt-6 flex h-14 gap-1 overflow-hidden rounded-2xl">
                {BUCKETS.map((b, i) => {
                  const v = num(data.buckets[b.key]);
                  if (v <= 0) return null;
                  return (
                    <motion.div key={b.key} title={`${t(b.en, b.bn)} · ${taka(v)}`}
                      className="relative flex min-w-[92px] items-center justify-center overflow-hidden px-2 first:rounded-l-2xl last:rounded-r-2xl"
                      style={{ background: b.color, color: b.ink, flexGrow: Math.max(v, total * 0.02), flexBasis: 0, transformOrigin: "left" }}
                      initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={{ duration: 0.7, ease, delay: 0.12 * i }}>
                      {i > 0 && <span className="hatch absolute inset-0 opacity-40" />}
                      <span className="tnum relative whitespace-nowrap text-[13px] font-bold">{short(v)}</span>
                    </motion.div>
                  );
                })}
                {total === 0 && <div className="grid flex-1 place-items-center rounded-2xl bg-leaf-wash text-sm font-medium text-leaf">{t("Nothing outstanding", "কোনো বাকি নেই")}</div>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {BUCKETS.map((b, i) => {
                  const v = num(data.buckets[b.key]);
                  return (
                    <motion.div key={b.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + 0.07 * i }}
                      className={cn("rounded-xl border px-3.5 py-2.5", v > 0 ? "border-line bg-paper/70" : "border-dashed border-line/70 opacity-60")}>
                      <div className="flex items-center gap-1.5 text-xs text-ink-soft"><i className="size-2.5 rounded-[3px]" style={{ background: b.color }} />{t(b.en, b.bn)}</div>
                      <div className="tnum mt-1 text-[17px] font-semibold">{taka(v)}</div>
                      <div className="tnum text-[11px] text-mute">{pct(total ? (v / total) * 100 : 0, 1)}</div>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      </motion.div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* ---------- call list ---------- */}
        <motion.div variants={rise}>
          <Card className="p-5 sm:p-6">
            <SectionTitle hint={tab === "overdue" ? t("Largest overdue amount first.", "সবচেয়ে বেশি বকেয়া আগে।") : t("Everyone with a balance on their flat.", "যাঁদের ফ্ল্যাটে টাকা বাকি আছে।")}
              action={<Tabs value={tab} onChange={setTab} tabs={[{ id: "overdue", label: t("Behind", "বকেয়া"), count: late.length }, { id: "all", label: t("All balances", "সব বাকি"), count: rows.length }]} />}>
              <span className="flex items-center gap-2"><Phone className="size-4 text-brick" />{t("Call list", "ফোন করার তালিকা")}</span>
            </SectionTitle>
            {error ? <Empty title={error.message} />
              : !data ? <div className="space-y-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
              : list.length === 0 ? <Empty icon={<CircleCheck />} title={tab === "overdue" ? t("Nobody is behind", "কারও কিস্তি বকেয়া নেই") : t("No balances", "কোনো বাকি নেই")} hint={t("Every due installment has been collected.", "ডিউ হওয়া সব কিস্তি আদায় হয়েছে।")} />
              : (
                <ul className="space-y-2.5">
                  {list.map((r, i) => {
                    const od = num(r.overdue);
                    const severity = r.max_days_overdue > 60 ? "bg-[#8f1f1a] text-white" : r.max_days_overdue > 30 ? "bg-brick text-white" : od > 0 ? "bg-brass text-ink" : "bg-leaf-wash text-leaf";
                    return (
                      <motion.li key={r.booking} layout initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease, delay: 0.15 + Math.min(i * 0.04, 0.5) }}
                        className={cn("group grid items-center gap-x-4 gap-y-3 rounded-2xl border bg-card p-3.5 transition hover:shadow-card sm:grid-cols-[auto_minmax(0,1fr)_auto]", od > 0 ? "border-rose/25" : "border-line")}>
                        <div className={cn("tnum grid h-14 w-16 shrink-0 place-items-center rounded-xl text-center leading-none", severity)}>
                          {od > 0 ? <span><b className="block text-xl">{n(r.max_days_overdue)}</b><span className="text-[10px] uppercase tracking-wider opacity-80">{t("days late", "দিন দেরি")}</span></span> : <CircleCheck className="size-5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <Link href={`/bookings/${r.booking}`} className="truncate text-[15px] font-semibold hover:underline">{r.customer}</Link>
                            <span className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-paper">{r.project} · {r.flat}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
                            {od > 0 && <span>{t("Overdue", "বকেয়া")} <b className="tnum text-sm font-semibold text-rose">{taka(od)}</b></span>}
                            <span>{t("Total balance", "মোট বাকি")} <b className="tnum font-semibold text-ink">{short(r.total)}</b></span>
                            {r.oldest_due && <span>{t("since", "থেকে")} {date(r.oldest_due)}</span>}
                          </div>
                          {od > 0 && <Bar className="mt-2 max-w-xs" tone="rose" height={4} value={od} max={Math.max(num(worst?.overdue), 1)} delay={0.2 + Math.min(i * 0.04, 0.5)} />}
                        </div>
                        <div className="flex items-center gap-2 sm:justify-end">
                          <a href={`tel:${r.phone}`} className="tnum flex h-10 items-center gap-2 rounded-[10px] border border-line bg-card px-3 text-sm font-medium transition hover:border-leaf hover:bg-leaf-wash hover:text-leaf">
                            <Phone className="size-4" /><span className="hidden md:inline">{r.phone}</span>
                          </a>
                          {finance && <Button icon={<HandCoins className="size-4" />} onClick={() => setTarget(r)}>{t("Receive", "গ্রহণ")}</Button>}
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              )}
          </Card>
        </motion.div>

        <div className="space-y-5">
          {/* ---------- refunds owed ---------- */}
          {finance && owed.length > 0 && (
            <motion.div variants={rise}>
              <Card className="border-brick/30 p-5 sm:p-6">
                <SectionTitle hint={t("Cancelled bookings where money must go back to the customer.", "বাতিল বুকিং, যেখানে ক্রেতাকে টাকা ফেরত দিতে হবে।")}>
                  <span className="flex items-center gap-2"><Undo2 className="size-4 text-brick" />{t("Refunds owed", "ফেরত দিতে হবে")}</span>
                </SectionTitle>
                <ul className="space-y-3">
                  {owed.map((c) => (
                    <li key={c.id} className="rounded-xl border border-line p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/bookings/${c.booking}`} className="block truncate text-sm font-semibold hover:underline">{c.customer_name}</Link>
                          <span className="text-xs text-mute">{c.project_code} · {c.flat_code} · {t("cancelled", "বাতিল")} {date(c.date)}</span>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setRefund(c)}>{t("Pay refund", "রিফান্ড দিন")}</Button>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <Bar tone="leaf" height={6} value={num(c.refunded_amount)} max={num(c.refund_amount)} />
                        <span className="tnum whitespace-nowrap text-xs text-ink-soft">{taka(c.refunded_amount)} / {taka(c.refund_amount)}</span>
                      </div>
                      <p className="tnum mt-1.5 text-xs font-medium text-brick">{t("Still owed", "এখনো বাকি")} {taka(c.refund_outstanding)}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            </motion.div>
          )}

          {/* ---------- receipts feed ---------- */}
          <motion.div variants={rise}>
            <Card className="p-5 sm:p-6">
              <SectionTitle hint={t("Latest money received. Click to view the receipt.", "সর্বশেষ প্রাপ্ত টাকা। রিসিট দেখতে ক্লিক করুন।")}>
                <span className="flex items-center gap-2"><ReceiptText className="size-4 text-brick" />{t("Recent receipts", "সাম্প্রতিক রিসিট")}</span>
              </SectionTitle>
              {receiptsLoading && receipts.length === 0 ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
                : receipts.length === 0 ? <Empty icon={<Hourglass />} title={t("No receipts yet", "এখনো কোনো রিসিট নেই")} />
                : (
                  <ol className="scroll-thin relative -mr-2 max-h-[640px] overflow-y-auto pr-2">
                    <span className="absolute bottom-3 left-[7px] top-3 w-px bg-line" />
                    {receipts.map((r, i) => {
                      const voided = r.status === "VOIDED";
                      return (
                        <motion.li key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + Math.min(i * 0.025, 0.5) }} className="relative pl-6">
                          <span className={cn("absolute left-0 top-[18px] size-[15px] rounded-full border-[3px] border-card", voided ? "bg-mute" : "bg-leaf")} />
                          <button type="button" onClick={() => setSlip(r)} className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-paper-deep/70">
                            <Avatar name={r.customer_name} size={34} />
                            <span className="min-w-0 flex-1">
                              <span className={cn("block truncate text-sm font-medium", voided && "text-mute line-through")}>{r.customer_name}</span>
                              <span className="tnum block truncate text-xs text-mute">{date(r.date)} · {r.project_code} {r.flat_code} · {label("method", r.method)}</span>
                            </span>
                            <span className="text-right">
                              <span className={cn("tnum block text-sm font-semibold", voided ? "text-mute line-through" : "text-leaf")}>+{taka(r.amount)}</span>
                              <span className="tnum block text-[11px] text-mute">{voided ? t("Voided", "বাতিল") : r.number}</span>
                            </span>
                            <ArrowUpRight className="size-3.5 shrink-0 text-mute opacity-0 transition group-hover:opacity-100" />
                          </button>
                        </motion.li>
                      );
                    })}
                  </ol>
                )}
            </Card>
          </motion.div>
        </div>
      </div>

      <ReceiveModal open={!!target} onClose={() => setTarget(null)} installments={detail?.id === target?.booking ? detail?.installments : undefined}
        booking={target && { id: target.booking, number: target.number, customer_name: target.customer, project_code: target.project, flat_code: target.flat, outstanding: target.total, overdue: target.overdue }}
        onDone={(r) => r && setSlip(r)} />
      <ReceiptSlip receipt={slip} open={!!slip} onClose={() => setSlip(null)} />
      <RefundModal cancellation={refund} open={!!refund} onClose={() => setRefund(null)} />
    </Page>
  );
}
