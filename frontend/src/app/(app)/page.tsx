"use client";

import { ArrowUpRight, BellRing, CalendarClock, CircleAlert, FileWarning, HandCoins, LandPlot, Phone, Plus, TrendingUp, Wallet } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo } from "react";
import { Tower, type TowerFlat } from "@/components/building";
import { FlowChart } from "@/components/charts";
import { Page } from "@/components/shell";
import { Badge, Bar, Button, Card, CountUp, Empty, PageLoading, SectionTitle, cn, rise, stagger } from "@/components/ui";
import { useApi, useList } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Alert, Dashboard, Flat, ProjectFin } from "@/lib/types";

export default function DashboardPage() {
  const { user, can } = useAuth();
  const { t, short, taka, date, month, pct, n } = useT();
  const { data, error } = useApi<Dashboard>("/dashboard");
  const { rows: flats } = useList<Flat>("/flats?page_size=1000");
  const finance = can(ROLES.FINANCE);

  const flatsByProject = useMemo(() => {
    const map = new Map<number, TowerFlat[]>();
    for (const f of flats) map.set(f.project, [...(map.get(f.project) ?? []), { floor: f.floor, unit: f.unit, status: f.status }]);
    return map;
  }, [flats]);

  if (error) return <Page title={t("Dashboard", "ড্যাশবোর্ড")}><Empty icon={<CircleAlert />} title={error.message} /></Page>;
  if (!data) return <Page title={t("Dashboard", "ড্যাশবোর্ড")}><PageLoading /></Page>;

  const T = data.totals;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("Good morning", "শুভ সকাল") : hour < 17 ? t("Good afternoon", "শুভ অপরাহ্ন") : t("Good evening", "শুভ সন্ধ্যা");
  const sold = num(T.sold_value as string);
  const collected = num(T.collected as string);
  const trend = data.trend.map((p) => ({ label: month(p.month), inflow: num(p.inflow), outflow: num(p.outflow) }));

  return (
    <Page
      eyebrow={<><span className="size-1.5 animate-pulse-soft rounded-full bg-brick" />{date(data.as_of)}</>}
      title={<>{greeting}, {user?.first_name || user?.display_name}</>}
      subtitle={t("Here is where every project stands today.", "আজ প্রতিটি প্রজেক্ট কোথায় দাঁড়িয়ে আছে, এক নজরে।")}
      actions={
        <>
          {can(ROLES.SALES_TEAM) && <Link href="/collections"><Button variant="outline" icon={<HandCoins className="size-4" />}>{t("Receive payment", "টাকা গ্রহণ")}</Button></Link>}
          {can(ROLES.SALES_TEAM) && <Link href="/bookings/new"><Button icon={<Plus className="size-4" />}>{t("New booking", "নতুন বুকিং")}</Button></Link>}
        </>
      }
    >
      {/* ---------- skyline hero ---------- */}
      <motion.section variants={rise} className="bg-grid-night relative overflow-hidden rounded-3xl bg-night text-paper shadow-lift">
        <div className="pointer-events-none absolute -right-16 -top-24 size-80 rounded-full bg-brick/30 blur-[110px]" />
        <div className="pointer-events-none absolute -left-10 bottom-0 size-72 rounded-full bg-brass/15 blur-[110px]" />
        <div className="relative grid gap-8 p-6 sm:p-8 xl:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-paper/45">{t("Sold so far", "এ পর্যন্ত বিক্রি")}</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
              <CountUp value={sold} format={(v) => short(v)} className="text-[52px] font-bold leading-none tracking-tight sm:text-[64px]" />
              <span className="mb-2 rounded-full bg-white/10 px-3 py-1 text-sm">
                <b className="tnum text-brass">{n(T.flats_sold as number)}</b> / {n(T.flats as number)} {t("flats", "ফ্ল্যাট")}
              </span>
            </div>
            <div className="mt-7 max-w-lg">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-paper/60">{t("Collected", "আদায় হয়েছে")} <b className="tnum ml-1 text-paper">{short(T.collected as string)}</b></span>
                <span className="text-paper/60">{t("Still to collect", "আদায় বাকি")} <b className="tnum ml-1 text-paper">{short(T.receivable as string)}</b></span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-leaf to-brass" initial={{ width: 0 }} animate={{ width: `${sold ? (collected / sold) * 100 : 0}%` }} transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1], delay: 0.3 }} />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <HeroStat label={t("Overdue", "মেয়াদোত্তীর্ণ বকেয়া")} value={short(T.overdue as string)} tone={num(T.overdue as string) > 0 ? "rose" : "leaf"} />
                <HeroStat label={t("Due in 30 days", "৩০ দিনে ডিউ")} value={short(T.due_next_30_days as string)} tone="brass" />
                <HeroStat label={t("Unsold stock", "অবিক্রিত ফ্ল্যাটের মূল্য")} value={short(T.unsold_value as string)} tone="paper" className="col-span-2 sm:col-span-1" />
              </div>
            </div>
          </div>
          <div className="flex items-end justify-center gap-5 xl:justify-end">
            {data.projects.map((p, i) => (
              <Link key={p.project.id} href={`/projects/${p.project.id}`} className="group flex flex-col items-center">
                <motion.div whileHover={{ y: -6 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                  <Tower flats={flatsByProject.get(p.project.id) ?? []} storeys={p.project.storeys} built={num(p.progress.work)} width={128} height={216} dark delay={0.25 + i * 0.3} label={p.project.name} />
                </motion.div>
                <span className="mt-2 text-sm font-semibold">{p.project.code}</span>
                <span className="tnum text-xs text-paper/50">{pct(p.progress.work)} {t("built", "নির্মিত")} · {n(p.flats.sold)}/{n(p.flats.total)}</span>
              </Link>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ---------- money tiles ---------- */}
      {finance && (
        <motion.div variants={stagger} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile icon={<TrendingUp className="size-5" />} tone="leaf" label={t("Profit on books", "বুকে প্রফিট")} value={num(T.booked_profit as string)} fmt={short}
            foot={<SplitBar a={num(T.land_profit as string)} b={num(T.building_profit as string)} la={t("Land", "জমি")} lb={t("Building", "ভবন")} fmt={short} />} />
          <Tile icon={<HandCoins className="size-5" />} tone="brass" label={t("Profit in hand", "হাতে আসা প্রফিট")} value={num(T.realised_profit as string)} fmt={short}
            foot={<p className="text-xs text-mute">{t("Realised in proportion to money collected", "আদায়ের অনুপাতে হাতে আসা লাভ")}</p>} />
          <Tile icon={<Wallet className="size-5" />} tone="sky" label={t("Cash & bank", "নগদ ও ব্যাংক")} value={num(T.cash as string)} fmt={short}
            foot={<div className="space-y-1">{data.cash_accounts.map((a) => <div key={a.id} className="flex justify-between text-xs"><span className="text-mute">{t(a.name, a.name_bn)}</span><span className="tnum font-medium">{short(a.balance)}</span></div>)}</div>} />
          <Tile icon={<LandPlot className="size-5" />} tone="brick" label={t("Owed to landowners", "জমির মালিককে বাকি")} value={num(T.land_remaining as string)} fmt={short}
            foot={<div className="flex justify-between text-xs"><span className="text-mute">{t("Owed to vendors", "সরবরাহকারীর দেনা")}</span><span className="tnum font-medium">{short(T.vendor_payable as string)}</span></div>} />
        </motion.div>
      )}

      {/* ---------- trend + alerts ---------- */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <motion.div variants={rise}>
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle hint={t("Actual receipts and payments, last 12 months", "গত ১২ মাসের প্রকৃত আদায় ও পরিশোধ")}
              action={<div className="flex gap-3 text-xs text-ink-soft"><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-leaf" />{t("In", "আয়")}</span>{finance && <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-brick" />{t("Out", "ব্যয়")}</span>}</div>}>
              {t("Money in and out", "টাকার আসা-যাওয়া")}
            </SectionTitle>
            <FlowChart data={trend} fmt={(v) => short(v)} inLabel={t("Collected", "আদায়")} outLabel={t("Paid out", "পরিশোধ")} showOut={finance} />
          </Card>
        </motion.div>
        <motion.div variants={rise}>
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle hint={t("Things that need a decision", "যেগুলোতে সিদ্ধান্ত দরকার")}>
              <span className="flex items-center gap-2"><BellRing className="size-4 text-brick" />{t("Attention", "নজর দিন")}</span>
            </SectionTitle>
            {data.alerts.length === 0 ? (
              <Empty title={t("All clear", "সব ঠিক আছে")} hint={t("No overdue dues, deadlines or bills right now.", "এই মুহূর্তে কোনো বকেয়া, ডেডলাইন বা বিল নেই।")} />
            ) : (
              <ul className="space-y-2.5">
                {data.alerts.map((a, i) => <AlertRow key={i} a={a} index={i} />)}
              </ul>
            )}
          </Card>
        </motion.div>
      </div>

      {/* ---------- projects + upcoming ---------- */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <motion.div variants={rise}>
          <Card className="p-5 sm:p-6">
            <SectionTitle hint={t("Work done, money spent and money collected, side by side", "কাজ, খরচ আর আদায় পাশাপাশি")} action={<Link href="/projects" className="flex items-center gap-1 text-sm font-medium text-brick hover:underline">{t("All projects", "সব প্রজেক্ট")}<ArrowUpRight className="size-4" /></Link>}>
              {t("Project pulse", "প্রজেক্টের অবস্থা")}
            </SectionTitle>
            <div className="space-y-5">
              {data.projects.map((p) => <ProjectPulse key={p.project.id} p={p} finance={finance} />)}
            </div>
          </Card>
        </motion.div>
        <motion.div variants={rise}>
          <Card className="p-5 sm:p-6">
            <SectionTitle hint={t("Overdue first, then the next 30 days", "আগে মেয়াদোত্তীর্ণ, তারপর আগামী ৩০ দিন")} action={<Link href="/collections" className="flex items-center gap-1 text-sm font-medium text-brick hover:underline">{t("Collections", "আদায়")}<ArrowUpRight className="size-4" /></Link>}>
              <span className="flex items-center gap-2"><CalendarClock className="size-4 text-brick" />{t("Dues to collect", "যে কিস্তি তুলতে হবে")}</span>
            </SectionTitle>
            {data.upcoming.length === 0 ? <Empty title={t("Nothing due soon", "শীঘ্রই কোনো কিস্তি নেই")} /> : (
              <ul className="-mx-2">
                {data.upcoming.slice(0, 8).map((u, i) => (
                  <motion.li key={`${u.booking}-${u.title}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.04 }}>
                    <Link href={`/bookings/${u.booking}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-paper-deep/70">
                      <span className={cn("tnum grid w-14 shrink-0 place-items-center rounded-lg py-1 text-[11px] font-semibold leading-tight", u.days < 0 ? "bg-rose-wash text-rose" : u.days <= 7 ? "bg-brass-wash text-[#8a6410]" : "bg-paper-deep text-ink-soft")}>
                        {u.days < 0 ? <>{n(-u.days)}<span className="font-normal">{t("d late", "দিন দেরি")}</span></> : u.days === 0 ? t("Today", "আজ") : <>{n(u.days)}<span className="font-normal">{t("days", "দিন")}</span></>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{u.customer}</span>
                        <span className="block truncate text-xs text-mute">{u.project} · {u.flat} · {u.title}</span>
                      </span>
                      <span className="tnum text-sm font-semibold">{taka(u.amount)}</span>
                      <Phone className="size-3.5 text-mute" />
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </Card>
        </motion.div>
      </div>
    </Page>
  );
}

function HeroStat({ label, value, tone, className }: { label: string; value: string; tone: "rose" | "brass" | "leaf" | "paper"; className?: string }) {
  const color = { rose: "text-[#ff8f86]", brass: "text-brass", leaf: "text-[#6fd3a6]", paper: "text-paper" }[tone];
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3", className)}>
      <div className="text-[11px] uppercase tracking-[0.12em] text-paper/45">{label}</div>
      <div className={cn("tnum mt-1 text-xl font-semibold", color)}>{value}</div>
    </div>
  );
}

function Tile({ icon, tone, label, value, fmt, foot }: { icon: React.ReactNode; tone: "leaf" | "brass" | "sky" | "brick"; label: string; value: number; fmt: (v: number) => string; foot?: React.ReactNode }) {
  const tones = { leaf: "bg-leaf-wash text-leaf", brass: "bg-brass-wash text-[#8a6410]", sky: "bg-sky-wash text-sky", brick: "bg-brick-wash text-brick-deep" };
  return (
    <motion.div variants={rise}>
      <Card hover className="flex h-full flex-col p-5">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-10 place-items-center rounded-xl", tones[tone])}>{icon}</span>
          <span className="text-sm font-medium text-ink-soft">{label}</span>
        </div>
        <CountUp value={value} format={fmt} className={cn("mt-3 text-[30px] font-bold leading-none tracking-tight", value < 0 && "text-rose")} />
        {foot && <div className="mt-auto pt-4">{foot}</div>}
      </Card>
    </motion.div>
  );
}

function SplitBar({ a, b, la, lb, fmt }: { a: number; b: number; la: string; lb: string; fmt: (v: number) => string }) {
  const pa = Math.max(a, 0), pb = Math.max(b, 0);
  const total = pa + pb || 1;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-paper-deep">
        <motion.div className="bg-brass" initial={{ width: 0 }} animate={{ width: `${(pa / total) * 100}%` }} transition={{ duration: 0.9, delay: 0.4 }} />
        <motion.div className="bg-brick" initial={{ width: 0 }} animate={{ width: `${(pb / total) * 100}%` }} transition={{ duration: 0.9, delay: 0.5 }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="flex items-center gap-1.5 text-mute"><i className="size-2 rounded-full bg-brass" />{la} <b className={cn("tnum font-medium text-ink", a < 0 && "text-rose")}>{fmt(a)}</b></span>
        <span className="flex items-center gap-1.5 text-mute"><i className="size-2 rounded-full bg-brick" />{lb} <b className={cn("tnum font-medium text-ink", b < 0 && "text-rose")}>{fmt(b)}</b></span>
      </div>
    </div>
  );
}

function AlertRow({ a, index }: { a: Alert; index: number }) {
  const { t, short, date, n } = useT();
  const tone = { danger: "border-rose/30 bg-rose-wash/60", warning: "border-brass/40 bg-brass-wash/60", info: "border-sky/25 bg-sky-wash/50" }[a.severity];
  const iconTone = { danger: "bg-rose text-white", warning: "bg-brass text-ink", info: "bg-sky text-white" }[a.severity];
  let title: string, body: string, Icon = FileWarning;
  if (a.kind === "land_deadline") {
    Icon = LandPlot;
    title = t(`Land balance due in ${a.days} days`, `জমির বাকি টাকা ${n(a.days ?? 0)} দিনে দিতে হবে`);
    body = `${a.project} · ${a.title} · ${short(a.amount)} ${t("by", "—")} ${date(a.date)}` + (num(a.shortfall) > 0 ? ` · ${t("short by", "ঘাটতি")} ${short(a.shortfall)}` : "");
  } else if (a.kind === "overdue") {
    Icon = HandCoins;
    title = t(`${a.count} customers are behind on payments`, `${n(a.count ?? 0)} জন ক্রেতার কিস্তি বকেয়া`);
    body = `${short(a.amount)} ${t("past its due date", "মেয়াদ পেরিয়ে গেছে")}`;
  } else {
    title = t(`${a.count} vendor bills fall due soon`, `${n(a.count ?? 0)}টি বিল শীঘ্রই পরিশোধ করতে হবে`);
    body = `${short(a.amount)} ${t("to pay within 14 days", "১৪ দিনের মধ্যে")}`;
  }
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + index * 0.08 }}>
      <Link href={a.link} className={cn("flex items-start gap-3 rounded-2xl border p-3.5 transition hover:shadow-card", tone)}>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", iconTone)}><Icon className="size-4" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-snug">{title}</span>
          <span className="mt-0.5 block text-[13px] text-ink-soft">{body}</span>
        </span>
        <ArrowUpRight className="ml-auto size-4 shrink-0 text-mute" />
      </Link>
    </motion.li>
  );
}

function ProjectPulse({ p, finance }: { p: ProjectFin; finance: boolean }) {
  const { t, pct, short } = useT();
  const work = num(p.progress.work), cost = num(p.progress.cost), coll = num(p.progress.collection);
  // Spending running ahead of both work and collections is the early warning sign.
  const strained = finance && cost > work + 10 && cost > coll + 10;
  return (
    <Link href={`/projects/${p.project.id}`} className="block rounded-2xl border border-line/80 p-4 transition hover:border-ink/40 hover:shadow-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brick">{p.project.code}</span>
          <h3 className="truncate text-[15px] font-semibold">{p.project.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          {strained && <Badge tone="rose" dot>{t("Spending ahead", "খরচ এগিয়ে")}</Badge>}
          {!p.project.sales_open && <Badge tone="neutral">{t("Sales closed", "বিক্রি বন্ধ")}</Badge>}
          {finance && p.profit && <Badge tone={num(p.profit.booked) >= 0 ? "leaf" : "rose"}>{t("Profit", "লাভ")} {short(p.profit.booked)}</Badge>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Meter label={t("Work done", "কাজের অগ্রগতি")} value={work} text={pct(work)} tone="ink" />
        {finance && <Meter label={t("Budget spent", "বাজেট খরচ")} value={cost} text={pct(cost)} tone="brick" />}
        <Meter label={t("Collected", "আদায়")} value={coll} text={pct(coll)} tone="leaf" />
        {!finance && <Meter label={t("Flats sold", "ফ্ল্যাট বিক্রি")} value={num(p.progress.sales)} text={pct(p.progress.sales)} tone="brass" />}
      </div>
    </Link>
  );
}

function Meter({ label, value, text, tone }: { label: string; value: number; text: string; tone: "ink" | "brick" | "leaf" | "brass" }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-mute">{label}</span>
        <span className="tnum text-sm font-semibold">{text}</span>
      </div>
      <Bar value={value} tone={tone} />
    </div>
  );
}
