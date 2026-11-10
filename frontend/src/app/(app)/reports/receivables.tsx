"use client";

import { HandCoins, Phone } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { ProjectSelect } from "@/components/forms";
import { Avatar, Badge, Card, CountUp, Empty, Skeleton, Table, Td, Th, cn, ease, rise, stagger } from "@/components/ui";
import { qs, useApi } from "@/lib/api";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Receivables } from "@/lib/types";

export function ReceivablesReport() {
  const { t, short, taka, date, n, pct } = useT();
  const [project, setProject] = useState("");
  const { data, error } = useApi<Receivables>(`/reports/receivables${qs({ project })}`);
  if (error) return <Card><Empty title={error.message} /></Card>;

  const buckets = data ? [
    { key: "not_due", label: t("Not yet due", "এখনো ডিউ হয়নি"), value: num(data.buckets.not_due), color: "var(--color-leaf)", text: "text-leaf" },
    { key: "d1_30", label: t("1–30 days late", "১–৩০ দিন দেরি"), value: num(data.buckets.d1_30), color: "var(--color-brass)", text: "text-[#8a6410]" },
    { key: "d31_60", label: t("31–60 days", "৩১–৬০ দিন"), value: num(data.buckets.d31_60), color: "#d9772a", text: "text-[#a8551a]" },
    { key: "d61_90", label: t("61–90 days", "৬১–৯০ দিন"), value: num(data.buckets.d61_90), color: "var(--color-brick)", text: "text-brick-deep" },
    { key: "d90_plus", label: t("Over 90 days", "৯০ দিনের বেশি"), value: num(data.buckets.d90_plus), color: "var(--color-rose)", text: "text-rose" },
  ] : [];
  const total = num(data?.total) || 1;
  const overdueMax = Math.max(...buckets.slice(1).map((b) => b.value), 1);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={rise} className="w-56"><ProjectSelect value={project} onChange={setProject} all={t("All projects", "সব প্রজেক্ট")} /></motion.div>
      {!data ? <Skeleton className="h-[480px]" /> : (
        <>
          <motion.div variants={rise}>
            <Card className="p-5 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-mute">{t("Still to collect from the market", "মার্কেট থেকে তুলতে বাকি")}</p>
                  <CountUp value={num(data.total)} format={short} className="mt-1 block text-[44px] font-bold leading-none tracking-tight" />
                  <p className="tnum mt-1.5 text-sm text-mute">{taka(data.total)} · {t("as of", "তারিখ")} {date(data.as_of)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-mute">{t("Past its due date", "মেয়াদ পেরিয়েছে")}</p>
                  <CountUp value={num(data.overdue)} format={short} className={cn("mt-1 block text-3xl font-bold leading-none", num(data.overdue) > 0 ? "text-rose" : "text-leaf")} />
                </div>
              </div>
              {/* one bar = every taka still owed, coloured by how late it is */}
              <div className="mt-6 flex h-5 gap-[3px] overflow-hidden rounded-full bg-paper-deep">
                {buckets.map((b, i) => b.value > 0 && (
                  <motion.div key={b.key} title={`${b.label}: ${taka(b.value)}`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ background: b.color }}
                    initial={{ width: 0 }} animate={{ width: `${Math.max((b.value / total) * 100, 0.8)}%` }} transition={{ duration: 0.9, ease, delay: i * 0.1 }} />
                ))}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {buckets.map((b, i) => (
                  <motion.div key={b.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.07 }} className="relative overflow-hidden rounded-2xl border border-line p-4">
                    <motion.div className="absolute inset-x-0 bottom-0 opacity-[0.13]" style={{ background: b.color }}
                      initial={{ height: 0 }} animate={{ height: `${i === 0 ? (b.value / total) * 100 : (b.value / overdueMax) * 100}%` }} transition={{ duration: 1, ease, delay: 0.3 + i * 0.08 }} />
                    <div className="relative">
                      <div className="flex items-center gap-2 text-[13px] text-ink-soft"><i className="size-2.5 rounded-full" style={{ background: b.color }} />{b.label}</div>
                      <div className={cn("tnum mt-1.5 text-xl font-bold", b.value > 0 ? b.text : "text-mute")}>{short(b.value)}</div>
                      <div className="tnum text-xs text-mute">{pct((b.value / total) * 100, 1)}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>

          <motion.div variants={rise}>
            <Card className="overflow-hidden">
              {data.rows.length === 0 ? <Empty icon={<HandCoins />} title={t("Nothing is owed", "কোনো পাওনা নেই")} /> : (
                <Table>
                  <thead><tr>
                    <Th>{t("Customer", "ক্রেতা")}</Th><Th>{t("Flat", "ফ্ল্যাট")}</Th><Th right>{t("Overdue", "বকেয়া")}</Th><Th>{t("Oldest due", "সবচেয়ে পুরোনো")}</Th>
                    <Th right>{t("Not yet due", "ডিউ হয়নি")}</Th><Th right>{t("Total owed", "মোট পাওনা")}</Th>
                  </tr></thead>
                  <tbody>
                    {data.rows.map((r, i) => {
                      const late = r.max_days_overdue;
                      return (
                        <motion.tr key={r.booking} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.025 }} className="transition hover:bg-paper-deep/50">
                          <Td>
                            <Link href={`/bookings/${r.booking}`} className="flex items-center gap-3">
                              <Avatar name={r.customer} size={34} />
                              <span className="min-w-0"><span className="block truncate font-medium hover:text-brick">{r.customer}</span><span className="tnum flex items-center gap-1 text-xs text-mute"><Phone className="size-3" />{r.phone}</span></span>
                            </Link>
                          </Td>
                          <Td><span className="font-medium">{r.project} · {r.flat}</span><span className="tnum block text-xs text-mute">{r.number}</span></Td>
                          <Td right className={cn("font-semibold", num(r.overdue) > 0 ? "text-rose" : "text-mute")}>{num(r.overdue) > 0 ? taka(r.overdue) : "—"}</Td>
                          <Td>{late > 0 ? <Badge tone={late > 60 ? "rose" : late > 30 ? "brick" : "brass"} dot>{t(`${late} days late`, `${n(late)} দিন দেরি`)}</Badge> : <Badge tone="leaf" dot>{t("On time", "সময়মতো")}</Badge>}{r.oldest_due && <span className="tnum mt-0.5 block text-xs text-mute">{date(r.oldest_due)}</span>}</Td>
                          <Td right>{taka(r.not_due)}</Td>
                          <Td right className="font-bold">{taka(r.total)}</Td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
