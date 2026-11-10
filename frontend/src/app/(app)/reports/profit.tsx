"use client";

import { Building2, LandPlot, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Waterfall } from "@/components/charts";
import { Badge, Card, CountUp, Empty, Ring, SectionTitle, Skeleton, Table, Td, Th, cn, ease, rise, stagger } from "@/components/ui";
import { useApi } from "@/lib/api";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { ProjectFin } from "@/lib/types";

export function ProfitReport() {
  const { t, short, taka, pct } = useT();
  const { data, error } = useApi<ProjectFin[]>("/reports/profit");
  if (error) return <Card><Empty title={error.message} /></Card>;
  if (!data) return <div className="space-y-5"><Skeleton className="h-44" /><Skeleton className="h-96" /></div>;
  const rows = data.filter((p) => p.profit && p.cost);
  if (rows.length === 0) return <Card><Empty title={t("No projects yet", "এখনো কোনো প্রজেক্ট নেই")} /></Card>;

  const sum = (f: (p: ProjectFin) => string | undefined) => rows.reduce((a, p) => a + num(f(p)), 0);
  const sold = sum((p) => p.sales.sold_value), booked = sum((p) => p.profit!.booked), realised = sum((p) => p.profit!.realised);
  const land = sum((p) => p.profit!.land), building = sum((p) => p.profit!.building), projected = sum((p) => p.profit!.projected);
  const collected = sum((p) => p.sales.collected);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      {/* ---------- company total ---------- */}
      <motion.section variants={rise} className="bg-grid-night relative overflow-hidden rounded-3xl bg-night p-6 text-paper shadow-lift sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 size-80 rounded-full bg-leaf/25 blur-[110px]" />
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-paper/45">{t("Profit on books — all projects", "বুকে প্রফিট — সব প্রজেক্ট")}</p>
            <CountUp value={booked} format={short} className={cn("mt-2 block text-[56px] font-bold leading-none tracking-tight", booked < 0 && "text-[#ff8f86]")} />
            <p className="mt-3 max-w-md text-sm text-paper/55">{t("Sold value minus the share of land and building cost that belongs to the flats already sold.", "বিক্রিত মূল্য থেকে বিক্রি হওয়া ফ্ল্যাটগুলোর জমি ও নির্মাণ খরচের অংশ বাদ দিয়ে।")}</p>
            <div className="mt-6 grid max-w-lg grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-paper/45"><LandPlot className="size-3.5 text-brass" />{t("From land", "জমি থেকে")}</div>
                <div className={cn("tnum mt-1 text-xl font-semibold", land < 0 ? "text-[#ff8f86]" : "text-brass")}>{short(land)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-paper/45"><Building2 className="size-3.5 text-[#f0a184]" />{t("From building", "ভবন থেকে")}</div>
                <div className={cn("tnum mt-1 text-xl font-semibold", building < 0 ? "text-[#ff8f86]" : "text-[#f0a184]")}>{short(building)}</div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 lg:justify-end">
            <Ring value={booked > 0 ? (realised / booked) * 100 : 0} size={150} stroke={14} color="var(--color-leaf)" track="rgb(255 255 255 / 0.1)" delay={0.3}>
              <div><div className="tnum text-2xl font-bold">{pct(sold ? (collected / sold) * 100 : 0)}</div><div className="text-[10px] uppercase tracking-[0.14em] text-paper/50">{t("collected", "আদায়")}</div></div>
            </Ring>
            <div className="space-y-4">
              <div><div className="text-[11px] uppercase tracking-[0.12em] text-paper/45">{t("Profit in hand", "হাতে আসা প্রফিট")}</div><div className="tnum text-2xl font-semibold text-[#6fd3a6]">{short(realised)}</div></div>
              <div><div className="text-[11px] uppercase tracking-[0.12em] text-paper/45">{t("Still in the market", "মার্কেটে আটকে")}</div><div className="tnum text-2xl font-semibold">{short(booked - realised)}</div></div>
              <div><div className="text-[11px] uppercase tracking-[0.12em] text-paper/45">{t("If every flat sells", "সব ফ্ল্যাট বিক্রি হলে")}</div><div className="tnum text-2xl font-semibold text-brass">{short(projected)}</div></div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ---------- one bridge per project ---------- */}
      {rows.map((p) => <ProjectProfit key={p.project.id} p={p} />)}

      {/* ---------- table ---------- */}
      <motion.div variants={rise}>
        <Card className="overflow-hidden">
          <div className="p-5 pb-0 sm:p-6 sm:pb-0"><SectionTitle hint={t("All figures in taka", "সব অঙ্ক টাকায়")}>{t("Side by side", "পাশাপাশি তুলনা")}</SectionTitle></div>
          <Table>
            <thead><tr>
              <Th>{t("Project", "প্রজেক্ট")}</Th><Th right>{t("Sold", "বিক্রি")}</Th><Th right>{t("Land profit", "জমির লাভ")}</Th><Th right>{t("Building profit", "ভবনের লাভ")}</Th>
              <Th right>{t("On books", "বুকে")}</Th><Th right>{t("Margin", "মার্জিন")}</Th><Th right>{t("In hand", "হাতে")}</Th><Th right>{t("If all sells", "সব বিক্রি হলে")}</Th>
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.project.id} className="transition hover:bg-paper-deep/50">
                  <Td><Link href={`/projects/${p.project.id}`} className="font-medium hover:text-brick hover:underline"><span className="mr-2 text-xs font-semibold text-brick">{p.project.code}</span>{p.project.name}</Link></Td>
                  <Td right>{taka(p.sales.sold_value)}</Td>
                  <Td right className={cn(num(p.profit!.land) < 0 && "text-rose")}>{taka(p.profit!.land)}</Td>
                  <Td right className={cn(num(p.profit!.building) < 0 && "text-rose")}>{taka(p.profit!.building)}</Td>
                  <Td right className={cn("font-semibold", num(p.profit!.booked) < 0 && "text-rose")}>{taka(p.profit!.booked)}</Td>
                  <Td right>{pct(p.profit!.margin_percent, 1)}</Td>
                  <Td right>{taka(p.profit!.realised)}</Td>
                  <Td right>{taka(p.profit!.projected)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-ink text-paper">
              <td className="px-4 py-3 text-sm font-semibold uppercase tracking-[0.1em]">{t("Company", "কোম্পানি")}</td>
              {[sold, land, building, booked].map((v, i) => <td key={i} className="tnum px-4 py-3 text-right font-bold">{taka(v)}</td>)}
              <td className="tnum px-4 py-3 text-right font-bold">{pct(sold ? (booked / sold) * 100 : 0, 1)}</td>
              <td className="tnum px-4 py-3 text-right font-bold">{taka(realised)}</td><td className="tnum px-4 py-3 text-right font-bold">{taka(projected)}</td>
            </tr></tfoot>
          </Table>
        </Card>
      </motion.div>
    </motion.div>
  );
}

function ProjectProfit({ p }: { p: ProjectFin }) {
  const { t, short, taka, pct, n } = useT();
  const pr = p.profit!, cost = p.cost!;
  const soldValue = num(p.sales.sold_value);
  const landCost = num(p.sales.sold_land_value) - num(pr.land);
  const buildCost = num(p.sales.sold_building_value) - num(pr.building);
  const booked = num(pr.booked), realised = num(pr.realised), land = num(pr.land), building = num(pr.building);
  const top = Math.max(Math.abs(land), Math.abs(building), 1);
  const overrun = num(cost.overrun);

  return (
    <motion.div variants={rise}>
      <Card className="p-5 sm:p-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brick">{p.project.code}</span>
            <h3 className="truncate text-lg font-semibold tracking-tight">{p.project.name}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{n(p.flats.sold)}/{n(p.flats.total)} {t("flats sold", "ফ্ল্যাট বিক্রি")}</Badge>
            <Badge tone={booked >= 0 ? "leaf" : "rose"}>{t("Margin", "মার্জিন")} {pct(pr.margin_percent, 1)}</Badge>
            {overrun > 0 && <Badge tone="rose"><TriangleAlert className="size-3" />{t("Over estimate by", "এস্টিমেটের চেয়ে বেশি")} {short(overrun)}</Badge>}
            {!cost.estimate_version && <Badge tone="brass">{t("No estimate", "এস্টিমেট নেই")}</Badge>}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-center">
          {soldValue > 0 ? (
            <Waterfall fmt={(v) => short(v)} steps={[
              { label: t("Sold", "বিক্রি"), value: soldValue, kind: "start" },
              { label: t("Land cost", "জমির খরচ"), value: landCost, kind: "minus" },
              { label: t("Building cost", "নির্মাণ খরচ"), value: buildCost, kind: "minus" },
              { label: t("Profit", "লাভ"), value: booked, kind: "total" },
            ]} />
          ) : <Empty title={t("Nothing sold yet", "এখনো কিছু বিক্রি হয়নি")} />}

          <div className="space-y-5">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{t("Where the profit comes from", "লাভ কোথা থেকে আসছে")}</div>
              {([[t("Land", "জমি"), land, "bg-brass"], [t("Building", "ভবন"), building, "bg-brick"]] as const).map(([label, value, fill], i) => (
                <div key={label} className="mb-2.5">
                  <div className="mb-1 flex items-baseline justify-between text-sm"><span className="text-ink-soft">{label}</span><span className={cn("tnum font-semibold", value < 0 && "text-rose")} title={taka(value)}>{short(value)}</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-paper-deep">
                    <motion.div className={cn("h-full rounded-full", value < 0 ? "bg-rose" : fill)} initial={{ width: 0 }} whileInView={{ width: `${(Math.abs(value) / top) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease, delay: 0.2 + i * 0.12 }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-leaf-wash/70 px-4 py-3">
                <div className="text-xs text-mute">{t("In hand", "হাতে এসেছে")}</div>
                <div className="tnum text-lg font-bold text-leaf">{short(realised)}</div>
                <div className="tnum text-xs text-mute">{pct(p.progress.collection)} {t("collected", "আদায়")}</div>
              </div>
              <div className="rounded-2xl bg-paper-deep/70 px-4 py-3">
                <div className="text-xs text-mute">{t("Still in the market", "মার্কেটে আটকে")}</div>
                <div className="tnum text-lg font-bold">{short(booked - realised)}</div>
                <div className="tnum text-xs text-mute">{short(p.sales.receivable)} {t("to collect", "আদায় বাকি")}</div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-dashed border-line px-4 py-3 text-sm">
              <span className="text-mute">{t("If every flat sells at list price", "সব ফ্ল্যাট তালিকামূল্যে বিক্রি হলে")}</span>
              <span className="text-right"><b className={cn("tnum block text-base", num(pr.projected) < 0 && "text-rose")}>{short(pr.projected)}</b><span className="tnum text-xs text-mute">{pct(pr.projected_margin_percent, 1)} {t("margin", "মার্জিন")}</span></span>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
