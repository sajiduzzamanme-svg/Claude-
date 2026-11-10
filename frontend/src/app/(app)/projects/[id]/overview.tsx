"use client";

import { ArrowUpRight, CalendarClock, Coins, HandCoins, LandPlot, Scale, TrendingUp, Wallet } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { STATUS_FILL, type FlatStatus } from "@/components/building";
import { DualBar } from "@/components/charts";
import { useLabel } from "@/components/forms";
import { Block, Figure, Panel } from "@/components/project-parts";
import { Badge, Bar, Card, CountUp, Empty, KeyValue, Ring, SectionTitle, Skeleton, cn, ease } from "@/components/ui";
import { useApi } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { daysFromToday, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Flat, Project, ProjectFin } from "@/lib/types";

type Go = (tab: "flats" | "estimate" | "documents" | "milestones" | "revisions") => void;

export function OverviewTab({ project, flats, onGo }: { project: Project; flats: Flat[]; onGo: Go }) {
  const { can } = useAuth();
  return can(ROLES.FINANCE) ? <FinanceOverview project={project} onGo={onGo} /> : <BasicOverview project={project} flats={flats} onGo={onGo} />;
}

/* ---------- for owner / admin / accounts ---------- */
function FinanceOverview({ project, onGo }: { project: Project; onGo: Go }) {
  const { t, short, taka, pct, n, date } = useT();
  const { data: fin, error } = useApi<ProjectFin>(`/projects/${project.id}/summary`);

  if (error) return <Card><Empty title={error.message} /></Card>;
  if (!fin) return <div className="grid gap-5 xl:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-56 xl:col-span-2" /></div>;

  const work = num(fin.progress.work), cost = num(fin.progress.cost), coll = num(fin.progress.collection);
  const sold = num(fin.sales.sold_value), collected = num(fin.sales.collected), overdue = num(fin.sales.overdue), notDue = num(fin.sales.not_yet_due);
  const insight =
    cost > work + 10 && cost > coll + 10 ? { tone: "rose" as const, text: t("Money is going out faster than both the work and the collections. Check the estimate.", "কাজ ও আদায় — দুটোর চেয়েই খরচ দ্রুত বাড়ছে। এস্টিমেট মিলিয়ে দেখুন।") }
    : coll + 10 < work ? { tone: "brass" as const, text: t("The building is ahead of the collections. Dues need chasing.", "নির্মাণ আদায়ের চেয়ে এগিয়ে। বকেয়া তোলায় জোর দিন।") }
    : { tone: "leaf" as const, text: t("Work, spending and collections are moving together.", "কাজ, খরচ আর আদায় একসাথে এগোচ্ছে।") };
  const profit = fin.profit, land = fin.land, costs = fin.cost, cash = fin.cash;
  const deadlineDays = daysFromToday(land?.next_deadline);

  return (
    <Panel className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_1.25fr]">
        {/* three gauges */}
        <Block>
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle hint={t("The three should rise together", "তিনটি একসাথে বাড়া উচিত")}>{t("Progress", "অগ্রগতি")}</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              <Gauge value={work} label={t("Work done", "কাজ")} color="var(--color-ink)" text={pct(work)} delay={0.1} />
              <Gauge value={cost} label={t("Budget spent", "বাজেট খরচ")} color="var(--color-brick)" text={pct(cost)} delay={0.22} />
              <Gauge value={coll} label={t("Collected", "আদায়")} color="var(--color-leaf)" text={pct(coll)} delay={0.34} />
            </div>
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
              className={cn("mt-5 rounded-xl px-3.5 py-2.5 text-sm", insight.tone === "rose" ? "bg-rose-wash text-rose" : insight.tone === "brass" ? "bg-brass-wash text-[#8a6410]" : "bg-leaf-wash text-leaf")}>
              {insight.text}
            </motion.p>
          </Card>
        </Block>

        {/* sales and collections */}
        <Block>
          <Card className="h-full p-5 sm:p-6">
            <SectionTitle hint={t(`${fin.flats.sold} of ${fin.flats.total} flats sold`, `${n(fin.flats.total)}টির মধ্যে ${n(fin.flats.sold)}টি ফ্ল্যাট বিক্রি`)}
              action={<button type="button" onClick={() => onGo("flats")} className="flex items-center gap-1 text-sm font-medium text-brick hover:underline">{t("Flats", "ফ্ল্যাট")}<ArrowUpRight className="size-4" /></button>}>
              <span className="flex items-center gap-2"><HandCoins className="size-4 text-brick" />{t("Sales and collections", "বিক্রি ও আদায়")}</span>
            </SectionTitle>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{t("Sold value", "বিক্রিত মূল্য")}</div>
                <CountUp value={sold} format={(v) => short(v)} className="text-[40px] font-bold leading-none tracking-tight" />
              </div>
              <Figure label={t("Unsold stock", "অবিক্রিত মূল্য")} className="mb-1">{short(fin.flats.unsold_value)}</Figure>
              <Figure label={t("Due in 30 days", "৩০ দিনে ডিউ")} className="mb-1">{short(fin.sales.due_next_30_days)}</Figure>
            </div>
            <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-paper-deep">
              {[
                { v: collected, c: "bg-leaf", d: 0.2 }, { v: overdue, c: "bg-rose", d: 0.35 }, { v: notDue, c: "bg-brass/70", d: 0.5 },
              ].map((s, i) => (
                <motion.div key={i} className={s.c} initial={{ width: 0 }} animate={{ width: `${sold ? (s.v / sold) * 100 : 0}%` }} transition={{ duration: 0.9, ease, delay: s.d }} />
              ))}
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <Swatch color="bg-leaf" label={t("Collected", "আদায় হয়েছে")} value={taka(collected)} />
              <Swatch color="bg-rose" label={t("Overdue", "মেয়াদোত্তীর্ণ বকেয়া")} value={taka(overdue)} danger={overdue > 0} />
              <Swatch color="bg-brass/70" label={t("Not yet due", "এখনো ডিউ হয়নি")} value={taka(notDue)} />
            </div>
          </Card>
        </Block>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {/* profit */}
        {profit && (
          <Block className="lg:col-span-2 xl:col-span-1">
            <Card className="h-full p-5 sm:p-6">
              <SectionTitle hint={t("Sales so far against their share of cost", "এ পর্যন্ত বিক্রির বিপরীতে খরচের অংশ")}>
                <span className="flex items-center gap-2"><TrendingUp className="size-4 text-leaf" />{t("Profit", "লাভ")}</span>
              </SectionTitle>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{t("On the books", "বুকে প্রফিট")}</div>
                  <CountUp value={num(profit.booked)} format={(v) => short(v)} className={cn("text-[34px] font-bold leading-none tracking-tight", num(profit.booked) < 0 && "text-rose")} />
                </div>
                <Badge tone={num(profit.margin_percent) >= 0 ? "leaf" : "rose"}>{t("Margin", "মার্জিন")} {pct(profit.margin_percent, 1)}</Badge>
              </div>
              <div className="mt-5 space-y-3">
                <SourceBar label={t("From land", "জমি থেকে")} value={num(profit.land)} max={Math.max(Math.abs(num(profit.land)), Math.abs(num(profit.building)), 1)} tone="brass" text={short(profit.land)} delay={0.2} />
                <SourceBar label={t("From building", "ভবন থেকে")} value={num(profit.building)} max={Math.max(Math.abs(num(profit.land)), Math.abs(num(profit.building)), 1)} tone="brick" text={short(profit.building)} delay={0.32} />
              </div>
              <div className="mt-5 border-t border-line pt-3">
                <KeyValue label={t("In hand (by money collected)", "হাতে এসেছে (আদায় অনুযায়ী)")}>{taka(profit.realised)}</KeyValue>
                <KeyValue label={t("If every flat sells at list price", "সব ফ্ল্যাট তালিকামূল্যে বিক্রি হলে")}>
                  <span className={cn(num(profit.projected) < 0 && "text-rose")}>{taka(profit.projected)}</span>
                  <span className="ml-1.5 font-normal text-mute">({pct(profit.projected_margin_percent, 1)})</span>
                </KeyValue>
              </div>
            </Card>
          </Block>
        )}

        {/* land */}
        {land && (
          <Block>
            <Card className="h-full p-5 sm:p-6">
              <SectionTitle hint={t(`${land.parcels} parcel(s)`, `${n(land.parcels)}টি জমি`)}
                action={<Link href="/land" className="flex items-center gap-1 text-sm font-medium text-brick hover:underline">{t("Land", "জমি")}<ArrowUpRight className="size-4" /></Link>}>
                <span className="flex items-center gap-2"><LandPlot className="size-4 text-brass" />{t("Land position", "জমির অবস্থা")}</span>
              </SectionTitle>
              {land.parcels === 0 ? (
                <p className="py-6 text-center text-sm text-mute">{t("No land recorded for this project yet.", "এই প্রজেক্টে এখনো কোনো জমি যোগ হয়নি।")}</p>
              ) : (
                <>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="text-mute">{t("Paid to landowners", "জমির মালিককে পরিশোধ")}</span>
                    <span className="tnum font-semibold">{short(land.paid)} <span className="font-normal text-mute">/ {short(land.agreed)}</span></span>
                  </div>
                  <Bar value={num(land.paid)} max={Math.max(num(land.agreed), 1)} tone="brass" height={10} />
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Figure label={t("Still to pay", "এখনো বাকি")} tone={num(land.remaining) > 0 ? "brick" : "leaf"}>{short(land.remaining)}</Figure>
                    <Figure label={t("On bayna only", "শুধু বায়নায়")} tone={num(land.bayna_remaining) > 0 ? "rose" : undefined}>{short(land.bayna_remaining)}</Figure>
                  </div>
                  {land.next_deadline && deadlineDays !== null && (
                    <div className={cn("mt-4 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm", deadlineDays <= 30 ? "bg-rose-wash text-rose" : "bg-brass-wash text-[#8a6410]")}>
                      <CalendarClock className="size-4 shrink-0" />
                      <span>
                        {deadlineDays < 0
                          ? t(`Registration deadline passed ${-deadlineDays} days ago`, `রেজিস্ট্রির শেষ তারিখ ${n(-deadlineDays)} দিন আগে পেরিয়েছে`)
                          : t(`Register by ${date(land.next_deadline)} — ${deadlineDays} days left`, `${date(land.next_deadline)}-এর মধ্যে রেজিস্ট্রি — ${n(deadlineDays)} দিন বাকি`)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </Card>
          </Block>
        )}

        {/* cost and cash */}
        {costs && cash && (
          <Block>
            <Card className="h-full p-5 sm:p-6">
              <SectionTitle hint={costs.estimate_version ? t(`Against estimate v${costs.estimate_version}`, `এস্টিমেট v${n(costs.estimate_version)}-এর বিপরীতে`) : t("No estimate yet", "এখনো এস্টিমেট নেই")}
                action={<button type="button" onClick={() => onGo("estimate")} className="flex items-center gap-1 text-sm font-medium text-brick hover:underline">{t("Estimate", "এস্টিমেট")}<ArrowUpRight className="size-4" /></button>}>
                <span className="flex items-center gap-2"><Scale className="size-4 text-brick" />{t("Cost and cash", "খরচ ও নগদ")}</span>
              </SectionTitle>
              <CostLine label={t("Land", "জমি")} estimate={num(costs.estimate_land)} actual={num(costs.land_committed)} fmt={short} />
              <CostLine label={t("Building & other", "ভবন ও অন্যান্য")} estimate={num(costs.estimate_building)} actual={num(costs.actual_building)} fmt={short} />
              {num(costs.overrun) > 0 && <Badge tone="rose" dot className="mt-1">{t("Over estimate by", "এস্টিমেটের চেয়ে বেশি")} {short(costs.overrun)}</Badge>}
              <div className="mt-4 border-t border-line pt-3">
                <KeyValue label={<span className="flex items-center gap-1.5"><Wallet className="size-3.5" />{t("Net cash from this project", "এই প্রজেক্টের নিট নগদ")}</span>}>
                  <span className={cn(num(cash.net) < 0 && "text-rose")}>{taka(cash.net)}</span>
                </KeyValue>
                <KeyValue label={<span className="flex items-center gap-1.5"><Coins className="size-3.5" />{t("Owed to vendors", "সরবরাহকারীর দেনা")}</span>}>{taka(cash.vendor_payable)}</KeyValue>
                <KeyValue label={t("Retention held", "আটকে রাখা জামানত")}>{taka(cash.retention_held)}</KeyValue>
              </div>
            </Card>
          </Block>
        )}
      </div>
    </Panel>
  );
}

function Gauge({ value, label, color, text, delay }: { value: number; label: string; color: string; text: string; delay: number }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <Ring value={value} size={112} stroke={10} color={color} delay={delay}><span className="tnum text-xl font-bold">{text}</span></Ring>
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
    </div>
  );
}

function Swatch({ color, label, value, danger }: { color: string; label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-paper/70 px-3 py-2 sm:block">
      <span className="flex items-center gap-2 text-[13px] text-mute"><i className={cn("size-2.5 rounded-[3px]", color)} />{label}</span>
      <span className={cn("tnum block font-semibold sm:mt-0.5", danger && "text-rose")}>{value}</span>
    </div>
  );
}

function SourceBar({ label, value, max, tone, text, delay }: { label: string; value: number; max: number; tone: "brass" | "brick"; text: string; delay: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-mute">{label}</span>
        <span className={cn("tnum font-semibold", value < 0 && "text-rose")}>{text}</span>
      </div>
      <Bar value={Math.abs(value)} max={max} tone={value < 0 ? "rose" : tone} delay={delay} />
    </div>
  );
}

function CostLine({ label, estimate, actual, fmt }: { label: string; estimate: number; actual: number; fmt: (v: number) => string }) {
  const { t } = useT();
  return (
    <div className="mb-3.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-mute">{label}</span>
        <span className="tnum"><b className={cn("font-semibold", actual > estimate && estimate > 0 && "text-rose")}>{fmt(actual)}</b> <span className="text-mute">/ {estimate ? fmt(estimate) : t("no estimate", "এস্টিমেট নেই")}</span></span>
      </div>
      <DualBar estimate={estimate} actual={actual} />
    </div>
  );
}

/* ---------- for sales, engineer, purchase: no cost, cash or profit ---------- */
function BasicOverview({ project, flats, onGo }: { project: Project; flats: Flat[]; onGo: Go }) {
  const { t, pct, n } = useT();
  const label = useLabel();
  const counts = (["AVAILABLE", "HOLD", "BOOKED", "HANDED_OVER"] as FlatStatus[]).map((s) => ({ status: s, count: flats.filter((f) => f.status === s).length }));
  const work = num(project.progress);
  const soldPct = project.flats_total ? (project.flats_sold / project.flats_total) * 100 : 0;
  return (
    <Panel className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
      <Block>
        <Card className="h-full p-5 sm:p-6">
          <SectionTitle action={<button type="button" onClick={() => onGo("milestones")} className="flex items-center gap-1 text-sm font-medium text-brick hover:underline">{t("Milestones", "মাইলস্টোন")}<ArrowUpRight className="size-4" /></button>}>{t("Progress", "অগ্রগতি")}</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Gauge value={work} label={t("Work done", "কাজ")} color="var(--color-ink)" text={pct(work)} delay={0.1} />
            <Gauge value={soldPct} label={t("Flats sold", "ফ্ল্যাট বিক্রি")} color="var(--color-brass)" text={pct(soldPct)} delay={0.22} />
          </div>
        </Card>
      </Block>
      <Block>
        <Card className="h-full p-5 sm:p-6">
          <SectionTitle hint={t(`${project.flats_total} flats in this building`, `এই ভবনে ${n(project.flats_total)}টি ফ্ল্যাট`)}
            action={<button type="button" onClick={() => onGo("flats")} className="flex items-center gap-1 text-sm font-medium text-brick hover:underline">{t("Stacking plan", "স্ট্যাকিং প্ল্যান")}<ArrowUpRight className="size-4" /></button>}>
            {t("Flat status", "ফ্ল্যাটের অবস্থা")}
          </SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {counts.map((c, i) => (
              <motion.div key={c.status} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.07 }} className="rounded-2xl border border-line p-4">
                <i className="block size-4 rounded-[4px] border border-ink/50" style={{ background: STATUS_FILL[c.status] }} />
                <div className="tnum mt-3 text-3xl font-bold">{n(c.count)}</div>
                <div className="text-[13px] text-mute">{label("flat", c.status)}</div>
              </motion.div>
            ))}
          </div>
        </Card>
      </Block>
    </Panel>
  );
}
