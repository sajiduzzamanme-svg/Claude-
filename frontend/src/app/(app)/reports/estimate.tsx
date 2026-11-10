"use client";

import { ClipboardCheck, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { DualBar } from "@/components/charts";
import { Dot, ProjectChips } from "@/components/finance-parts";
import { CATEGORIES, StatusBadge } from "@/components/forms";
import { Badge, Card, Empty, Ring, Skeleton, cn, rise, stagger } from "@/components/ui";
import { useApi } from "@/lib/api";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Eva } from "@/lib/types";

export function EstimateReport() {
  const { t, short, taka, pct, n } = useT();
  const [project, setProject] = useState("");
  const { data, error } = useApi<Eva>(project ? `/projects/${project}/estimate-vs-actual` : null);
  const over = data?.rows.filter((r) => r.over_budget && num(r.estimate) > 0) ?? [];
  const unplanned = data?.rows.filter((r) => num(r.estimate) === 0 && num(r.actual) > 0) ?? [];
  const used = num(data?.totals.used_percent);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={rise}><ProjectChips value={project} onChange={setProject} /></motion.div>
      {error ? <Card><Empty title={error.message} /></Card> : !data ? <Skeleton className="h-[520px]" /> : data.rows.length === 0 ? (
        <Card><Empty icon={<ClipboardCheck />} title={t("No estimate and no cost yet", "এখনো এস্টিমেট বা খরচ নেই")} hint={t("Create the project's estimate from its page.", "প্রজেক্ট পেজ থেকে এস্টিমেট তৈরি করুন।")} /></Card>
      ) : (
        <>
          <motion.div variants={rise}>
            <Card className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[auto_1fr] lg:items-center">
              <div className="flex items-center gap-5">
                <Ring value={used} size={128} stroke={12} color={used > 100 ? "var(--color-rose)" : "var(--color-leaf)"}>
                  <div><div className={cn("tnum text-2xl font-bold", used > 100 && "text-rose")}>{pct(used)}</div><div className="text-[10px] uppercase tracking-[0.14em] text-mute">{t("of budget", "বাজেটের")}</div></div>
                </Ring>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {data.estimate ? <><Badge tone="ink">{t("Estimate", "এস্টিমেট")} v{n(data.estimate.version)}</Badge><StatusBadge group="doc" value={data.estimate.status} /></> : <Badge tone="brass">{t("No estimate yet", "এস্টিমেট নেই")}</Badge>}
                  </div>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-8"><span className="text-mute">{t("Estimate", "এস্টিমেট")}</span><b className="tnum">{taka(data.totals.estimate)}</b></div>
                    <div className="flex justify-between gap-8"><span className="text-mute">{t("Spent so far", "এ পর্যন্ত খরচ")}</span><b className="tnum">{taka(data.totals.actual)}</b></div>
                    <div className="flex justify-between gap-8 border-t border-line pt-1"><span className="text-mute">{num(data.totals.variance) >= 0 ? t("Left to spend", "খরচ করা বাকি") : t("Over budget", "বাজেটের বেশি")}</span><b className={cn("tnum", num(data.totals.variance) < 0 && "text-rose")}>{taka(Math.abs(num(data.totals.variance)))}</b></div>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.categories.map((c) => {
                  const def = CATEGORIES.find((x) => x.id === c.category)!;
                  return (
                    <div key={c.category} className={cn("rounded-2xl border px-4 py-3", c.over_budget ? "border-rose/30 bg-rose-wash/50" : "border-line")}>
                      <div className="mb-2 flex items-center justify-between gap-2 text-[13px]"><span className="flex items-center gap-2 font-medium"><Dot color={def.color} />{t(def.en, def.bn)}</span>{c.over_budget && <TriangleAlert className="size-4 text-rose" />}</div>
                      <DualBar estimate={num(c.estimate)} actual={num(c.actual)} />
                      <div className="mt-1.5 flex justify-between text-xs text-mute"><span className="tnum">{short(c.actual)}</span><span className="tnum">/ {short(c.estimate)}</span></div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>

          {(over.length > 0 || unplanned.length > 0) && (
            <motion.div variants={rise} className="flex items-start gap-3 rounded-2xl border border-rose/30 bg-rose-wash/60 px-4 py-3 text-sm">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-rose" />
              <span>
                {over.length > 0 && <>{t("Over the estimate: ", "এস্টিমেট ছাড়িয়েছে: ")}<b>{over.map((r) => t(r.name, r.name_bn || r.name)).join(", ")}</b>. </>}
                {unplanned.length > 0 && <>{t("Spent with no estimate line: ", "এস্টিমেটে ছিল না, তবু খরচ হয়েছে: ")}<b>{unplanned.map((r) => t(r.name, r.name_bn || r.name)).join(", ")}</b>.</>}
              </span>
            </motion.div>
          )}

          <motion.div variants={rise}>
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 text-xs text-mute">
                <span className="font-semibold uppercase tracking-[0.12em]">{t("By cost head", "খরচের খাত অনুযায়ী")}</span>
                <span className="flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-1.5"><i className="hatch h-2.5 w-5 rounded-sm bg-line" />{t("Estimate", "এস্টিমেট")}</span>
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-5 rounded-sm bg-leaf" />{t("Spent", "খরচ")}</span>
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-5 rounded-sm bg-rose" />{t("Over estimate", "এস্টিমেটের বেশি")}</span>
                </span>
              </div>
              {CATEGORIES.map((cat) => {
                const items = data.rows.filter((r) => r.category === cat.id);
                if (!items.length) return null;
                return (
                  <section key={cat.id}>
                    <header className="flex items-center gap-2 bg-paper/70 px-5 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-soft"><Dot color={cat.color} />{t(cat.en, cat.bn)}</header>
                    <ul>
                      {items.map((r, i) => {
                        const variance = num(r.variance);
                        return (
                          <motion.li key={r.cost_head} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}
                            className="grid items-center gap-x-5 gap-y-1.5 border-b border-line/60 px-5 py-3 text-sm sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_110px_110px_120px]">
                            <span className="min-w-0"><span className="tnum mr-2 text-xs text-mute">{r.code}</span><span className="font-medium">{t(r.name, r.name_bn || r.name)}</span></span>
                            <DualBar estimate={num(r.estimate)} actual={num(r.actual)} />
                            <span className="tnum text-right text-mute" title={t("Estimate", "এস্টিমেট")}>{taka(r.estimate)}</span>
                            <span className="tnum text-right font-semibold" title={t("Spent", "খরচ")}>{taka(r.actual)}</span>
                            <span className={cn("tnum text-right text-[13px]", variance < 0 ? "font-semibold text-rose" : "text-leaf")}>
                              {variance < 0 ? `+${taka(-variance)}` : `${taka(variance)} ${t("left", "বাকি")}`}
                              {r.used_percent && <span className="block text-xs font-normal text-mute">{pct(r.used_percent)}</span>}
                            </span>
                          </motion.li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
