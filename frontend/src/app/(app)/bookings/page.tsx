"use client";

import { ArrowUpRight, BookOpenCheck, CircleAlert, Plus, Search } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ProjectSelect, StatusBadge } from "@/components/forms";
import { PaidBar, useDebounced } from "@/components/sales-parts";
import { Guard, Page } from "@/components/shell";
import { Avatar, Button, Card, CountUp, Empty, Input, Skeleton, Tabs, cn, ease, rise } from "@/components/ui";
import { qs, useList } from "@/lib/api";
import { ROLES } from "@/lib/auth";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Booking } from "@/lib/types";

type StatusTab = "" | "ACTIVE" | "HANDED_OVER" | "CANCELLED";

export default function BookingsPage() {
  return <Guard roles={ROLES.SALES_TEAM}><Bookings /></Guard>;
}

function Bookings() {
  const { t, short, n, pct } = useT();
  const [project, setProject] = useState("");
  const [status, setStatus] = useState<StatusTab>("");
  const [search, setSearch] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const q = useDebounced(search.trim(), 250);
  const { rows: all, loading, error } = useList<Booking>(`/bookings${qs({ page_size: 200, project, search: q })}`);

  const rows = useMemo(() => all.filter((b) => (!status || b.status === status) && (!lateOnly || num(b.overdue) > 0)), [all, status, lateOnly]);
  const live = rows.filter((b) => b.status !== "CANCELLED");
  const sum = (key: "contract_value" | "paid" | "outstanding" | "overdue") => live.reduce((a, b) => a + num(b[key]), 0);
  const contract = sum("contract_value"), paid = sum("paid"), outstanding = sum("outstanding"), overdue = sum("overdue");
  const notDue = Math.max(outstanding - overdue, 0);
  const count = (s: StatusTab) => all.filter((b) => !s || b.status === s).length;
  const seg = (v: number) => (contract ? (v / contract) * 100 : 0);

  return (
    <Page
      eyebrow={t("Sales register", "বিক্রয় খাতা")}
      title={t("Bookings", "বুকিং")}
      subtitle={t("Every flat sold, what it was sold for, and how much of it has come in.", "প্রতিটি বিক্রিত ফ্ল্যাট, কত দামে বিক্রি, আর কত টাকা এসেছে।")}
      actions={<Link href="/bookings/new"><Button icon={<Plus className="size-4" />}>{t("New booking", "নতুন বুকিং")}</Button></Link>}
    >
      {/* ---------- contract ribbon ---------- */}
      <motion.div variants={rise}>
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-mute">{t("Contract value", "মোট চুক্তিমূল্য")}</p>
              <CountUp value={contract} format={short} className="mt-1 block text-[34px] font-bold leading-none tracking-tight sm:text-[40px]" />
              <p className="mt-1.5 text-sm text-mute">{t(`${live.length} live bookings`, `${n(live.length)}টি চলমান বুকিং`)}</p>
            </div>
            <div className="grid basis-full grid-cols-3 gap-3 sm:max-w-xl sm:flex-1 sm:basis-auto">
              <Figure dot="bg-leaf" label={t("Collected", "আদায়")} value={paid} format={short} sub={pct(seg(paid))} />
              <Figure dot="bg-brass" label={t("Not yet due", "এখনো ডিউ হয়নি")} value={notDue} format={short} sub={pct(seg(notDue))} />
              <Figure dot="bg-rose" label={t("Overdue", "মেয়াদোত্তীর্ণ")} value={overdue} format={short} sub={pct(seg(overdue), 1)} danger={overdue > 0} />
            </div>
          </div>
          <div className="mt-5 flex h-5 overflow-hidden rounded-full bg-paper-deep">
            <motion.div className="h-full bg-leaf" initial={{ width: 0 }} animate={{ width: `${seg(paid)}%` }} transition={{ duration: 1, ease }} />
            <motion.div className="hatch h-full bg-rose" initial={{ width: 0 }} animate={{ width: `${seg(overdue)}%` }} transition={{ duration: 0.8, ease, delay: 0.25 }} />
            <motion.div className="h-full bg-brass/70" initial={{ width: 0 }} animate={{ width: `${seg(notDue)}%` }} transition={{ duration: 1, ease, delay: 0.4 }} />
          </div>
        </Card>
      </motion.div>

      {/* ---------- filters ---------- */}
      <motion.div variants={rise} className="mt-5 flex flex-wrap items-center gap-3">
        <Tabs<StatusTab> value={status} onChange={setStatus} tabs={[
          { id: "", label: t("All", "সব"), count: count("") },
          { id: "ACTIVE", label: t("Active", "চলমান"), count: count("ACTIVE") },
          { id: "HANDED_OVER", label: t("Handed over", "হস্তান্তরিত"), count: count("HANDED_OVER") },
          { id: "CANCELLED", label: t("Cancelled", "বাতিল"), count: count("CANCELLED") },
        ]} />
        <button onClick={() => setLateOnly((v) => !v)} className={cn("flex h-10 items-center gap-1.5 rounded-[10px] border px-3 text-sm font-medium transition", lateOnly ? "border-rose bg-rose text-white" : "border-line bg-card text-ink-soft hover:border-rose hover:text-rose")}>
          <CircleAlert className="size-4" />{t("Behind on payments", "কিস্তি বকেয়া")}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="w-52"><ProjectSelect value={project} onChange={setProject} all={t("All projects", "সব প্রজেক্ট")} /></div>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
            <Input className="pl-9" placeholder={t("Customer, phone, flat, booking no.", "ক্রেতা, ফোন, ফ্ল্যাট, বুকিং নং")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </motion.div>

      {/* ---------- register ---------- */}
      <div className="mt-4 space-y-2.5">
        {error ? <Card><Empty title={error.message} /></Card>
          : loading && all.length === 0 ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[76px]" />)
          : rows.length === 0 ? (
            <Card><Empty icon={<BookOpenCheck />} title={t("No bookings match", "কোনো বুকিং মিলছে না")} hint={t("Change the filters, or record a new sale.", "ফিল্টার বদলান, অথবা নতুন বিক্রি এন্ট্রি করুন।")}
              action={<Link href="/bookings/new"><Button icon={<Plus className="size-4" />}>{t("New booking", "নতুন বুকিং")}</Button></Link>} /></Card>
          ) : rows.map((b, i) => <BookingRow key={b.id} b={b} index={i} />)}
      </div>
    </Page>
  );
}

function Figure({ dot, label, value, format, sub, danger }: { dot: string; label: string; value: number; format: (v: number) => string; sub: string; danger?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-mute"><i className={cn("size-2 rounded-full", dot)} />{label}</div>
      <CountUp value={value} format={format} className={cn("mt-0.5 block text-base font-semibold tracking-tight sm:text-xl", danger && "text-rose")} />
      <div className="tnum text-xs text-mute">{sub}</div>
    </div>
  );
}

function BookingRow({ b, index }: { b: Booking; index: number }) {
  const { t, taka, short, date, pct } = useT();
  const contract = num(b.contract_value), paid = num(b.paid), overdue = num(b.overdue);
  const cancelled = b.status === "CANCELLED";
  const late = overdue > 0 && !cancelled;
  const delay = Math.min(index * 0.03, 0.45);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease, delay }}>
      <Link href={`/bookings/${b.id}`}
        className={cn("group relative grid items-center gap-x-5 gap-y-3 overflow-hidden rounded-2xl border bg-card px-4 py-3.5 shadow-card transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:shadow-lift sm:px-5 lg:grid-cols-[minmax(0,1.5fr)_150px_minmax(0,1.6fr)_140px_auto]",
          late ? "border-rose/40" : "border-line hover:border-ink/40", cancelled && "opacity-70")}>
        {late && <span className="absolute inset-y-0 left-0 w-1 bg-rose" />}
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={b.customer_name} size={40} />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{b.customer_name}</div>
            <div className="tnum truncate text-xs text-mute">{b.number} · {date(b.booking_date)}{b.sales_person_name ? ` · ${b.sales_person_name}` : ""}</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 min-w-12 place-items-center rounded-lg bg-ink px-2 text-sm font-bold text-paper">{b.flat_code}</span>
          <div className="text-xs leading-tight"><div className="font-semibold text-brick">{b.project_code}</div><div className="tnum text-mute">{num(b.flat_size).toFixed(0)} sft</div></div>
        </div>
        <div className="min-w-0">
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
            <span className="text-mute">{t("Paid", "পরিশোধ")} <b className="tnum ml-0.5 font-semibold text-ink">{short(paid)}</b> <span className="tnum">({pct(contract ? (paid / contract) * 100 : 0)})</span></span>
            {cancelled ? <span className="text-mute">{t("Sale cancelled", "বিক্রি বাতিল")}</span>
              : late ? <span className="tnum font-semibold text-rose">{t("Overdue", "বকেয়া")} {taka(overdue)}</span>
              : <span className="text-mute">{t("Balance", "বাকি")} <b className="tnum font-semibold text-ink">{short(b.outstanding)}</b></span>}
          </div>
          <PaidBar paid={paid} overdue={cancelled ? 0 : overdue} total={contract} delay={delay + 0.15} />
        </div>
        <div className="lg:text-right">
          <div className="text-[11px] uppercase tracking-[0.1em] text-mute">{t("Contract", "চুক্তিমূল্য")}</div>
          <div className="tnum text-[15px] font-semibold">{taka(contract)}</div>
        </div>
        <div className="flex items-center gap-3 lg:justify-end">
          <StatusBadge group="booking" value={b.status} />
          <ArrowUpRight className="size-4 text-mute transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink" />
        </div>
      </Link>
    </motion.div>
  );
}
