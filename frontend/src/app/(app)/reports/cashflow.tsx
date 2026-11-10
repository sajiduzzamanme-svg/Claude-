"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { FlowChart } from "@/components/charts";
import { ProjectSelect } from "@/components/forms";
import { Card, CountUp, Empty, SectionTitle, Skeleton, Table, Td, Th, cn, rise, stagger } from "@/components/ui";
import { qs, useApi } from "@/lib/api";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Cashflow } from "@/lib/types";

export function CashflowReport() {
  const { t, short, taka, month } = useT();
  const [months, setMonths] = useState(6);
  const [project, setProject] = useState("");
  const { data, error } = useApi<Cashflow>(`/reports/cashflow${qs({ months, project })}`);
  if (error) return <Card><Empty title={error.message} /></Card>;

  const rows = data?.months ?? [];
  const totalIn = rows.reduce((a, m) => a + num(m.inflow), 0);
  const totalOut = rows.reduce((a, m) => a + num(m.outflow), 0);
  const firstShort = rows.find((m) => num(m.closing_cash) < 0);
  const worst = rows.reduce<(typeof rows)[number] | null>((w, m) => (!w || num(m.closing_cash) < num(w.closing_cash) ? m : w), null);
  const short_ = !!firstShort;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={rise} className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-line bg-paper-deep/60 p-1 text-sm font-medium">
          {[6, 12].map((m) => (
            <button key={m} onClick={() => setMonths(m)} className={cn("rounded-lg px-3.5 py-1.5 transition", months === m ? "bg-ink text-paper" : "text-ink-soft hover:text-ink")}>{t(`${m} months`, `${m === 6 ? "৬" : "১২"} মাস`)}</button>
          ))}
        </div>
        <div className="w-52"><ProjectSelect value={project} onChange={setProject} all={t("Whole company", "পুরো কোম্পানি")} /></div>
        {project && <span className="text-xs text-mute">{t("Opening cash is always the company's total.", "প্রারম্ভিক নগদ সবসময় পুরো কোম্পানির।")}</span>}
      </motion.div>

      {!data ? <Skeleton className="h-[520px]" /> : (
        <>
          <motion.div variants={rise} className={cn("flex items-start gap-4 rounded-3xl border p-5 sm:p-6", short_ ? "border-rose/30 bg-rose-wash/70" : "border-leaf/30 bg-leaf-wash/60")}>
            <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl text-white", short_ ? "bg-rose" : "bg-leaf")}>{short_ ? <TriangleAlert className="size-6" /> : <CircleCheck className="size-6" />}</span>
            <div>
              <h2 className="text-[17px] font-semibold">
                {short_
                  ? t(`Cash runs short in ${month(firstShort!.month, true)}`, `${month(firstShort!.month, true)}-এ নগদ ঘাটতি দেখা দেবে`)
                  : t("Cash stays positive through the whole period", "পুরো সময়জুড়ে নগদ ইতিবাচক থাকবে")}
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-ink-soft">
                {short_
                  ? t(
                      `If customers pay on schedule and everything owed is paid when due, the balance falls to ${taka(worst!.closing_cash)} by the end of ${month(worst!.month, true)}. You need about ${short(-num(worst!.closing_cash))} more — from faster collection, new bookings, a loan or the owners — before then.`,
                      `ক্রেতারা সময়মতো দিলে এবং সব দেনা সময়মতো পরিশোধ করলে ${month(worst!.month, true)}-এর শেষে ব্যালেন্স নেমে দাঁড়াবে ${taka(worst!.closing_cash)}। তার আগে প্রায় ${short(-num(worst!.closing_cash))} বাড়তি দরকার — দ্রুত আদায়, নতুন বুকিং, ঋণ বা মালিকের কাছ থেকে।`,
                    )
                  : t(`The lowest point is ${taka(data.lowest_cash)}, assuming customers pay on schedule.`, `ক্রেতারা সময়মতো দিলে সর্বনিম্ন ব্যালেন্স হবে ${taka(data.lowest_cash)}।`)}
              </p>
            </div>
          </motion.div>

          <motion.div variants={rise} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {([
              [t("Cash today", "আজকের নগদ"), num(data.opening_cash), "text-ink"],
              [t("Expected in", "আসার কথা"), totalIn, "text-leaf"],
              [t("To pay out", "দিতে হবে"), totalOut, "text-brick"],
              [t("Lowest point", "সর্বনিম্ন অবস্থা"), num(data.lowest_cash), num(data.lowest_cash) < 0 ? "text-rose" : "text-ink"],
            ] as const).map(([label, value, tone]) => (
              <Card key={label} className="p-4"><div className="text-[13px] text-mute">{label}</div><CountUp value={value} format={short} className={cn("mt-1 block text-2xl font-bold tracking-tight", tone)} /></Card>
            ))}
          </motion.div>

          <motion.div variants={rise}>
            <Card className="p-5 sm:p-6">
              <SectionTitle hint={t("Unpaid installments by due month against land balances, vendor bills and refunds", "মাসভিত্তিক বাকি কিস্তি বনাম জমির বাকি, বিল ও রিফান্ড")}
                action={<div className="flex flex-wrap gap-3 text-xs text-ink-soft"><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-leaf" />{t("In", "আসবে")}</span><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-brick" />{t("Out", "যাবে")}</span><span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-ink" />{t("Cash left", "নগদ থাকবে")}</span></div>}>
                {t("Month by month", "মাস অনুযায়ী")}
              </SectionTitle>
              <FlowChart key={`${months}-${project}`} height={300} fmt={(v) => short(v)} inLabel={t("Expected in", "আসার কথা")} outLabel={t("To pay out", "দিতে হবে")} lineLabel={t("Cash left", "নগদ থাকবে")}
                data={rows.map((m) => ({ label: month(m.month, months > 6), inflow: num(m.inflow), outflow: num(m.outflow), line: num(m.closing_cash) }))} />
            </Card>
          </motion.div>

          <motion.div variants={rise}>
            <Card className="overflow-hidden">
              <Table>
                <thead><tr>
                  <Th>{t("Month", "মাস")}</Th><Th right>{t("Customers pay", "ক্রেতার কিস্তি")}</Th><Th right>{t("Landowners", "জমির মালিক")}</Th><Th right>{t("Vendors", "সরবরাহকারী")}</Th>
                  <Th right>{t("Refunds", "রিফান্ড")}</Th><Th right>{t("Net", "নিট")}</Th><Th right>{t("Cash at month end", "মাস শেষে নগদ")}</Th>
                </tr></thead>
                <tbody>
                  <tr className="bg-paper/60 text-mute"><Td colSpan={6}>{t("Cash in hand and bank today", "আজ হাতে ও ব্যাংকে নগদ")}</Td><Td right className="font-semibold text-ink">{taka(data.opening_cash)}</Td></tr>
                  {rows.map((m, i) => (
                    <motion.tr key={m.month} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className={cn("transition hover:bg-paper-deep/50", num(m.closing_cash) < 0 && "bg-rose-wash/50")}>
                      <Td className="font-medium">{month(m.month, true)}{i === 0 && num(data.overdue_included) > 0 && <span className="ml-2 text-xs font-normal text-mute">{t("incl. overdue", "বকেয়াসহ")} {short(data.overdue_included)}</span>}</Td>
                      <Td right className="text-leaf">{num(m.inflow) ? taka(m.inflow) : "—"}</Td>
                      <Td right>{num(m.land) ? taka(m.land) : "—"}</Td>
                      <Td right>{num(m.vendors) ? taka(m.vendors) : "—"}</Td>
                      <Td right>{num(m.refunds) ? taka(m.refunds) : "—"}</Td>
                      <Td right className={cn("font-medium", num(m.net) < 0 ? "text-rose" : "text-leaf")}>{taka(m.net)}</Td>
                      <Td right className={cn("font-bold", num(m.closing_cash) < 0 && "text-rose")}>{taka(m.closing_cash)}</Td>
                    </motion.tr>
                  ))}
                </tbody>
              </Table>
              <p className="border-t border-line px-5 py-3 text-xs text-mute">
                {t("After this period", "এই সময়ের পরে")}: {t("still to come in", "আরও আসবে")} <b className="tnum text-ink-soft">{short(data.beyond.inflow)}</b> · {t("still to pay (incl. retention)", "আরও দিতে হবে (জামানতসহ)")} <b className="tnum text-ink-soft">{short(data.beyond.outflow)}</b>.
                {" "}{t("Construction cost not yet billed is not included — see Estimate vs actual for the budget left to spend.", "যে নির্মাণ খরচের বিল এখনো হয়নি তা এখানে নেই — বাকি বাজেট দেখতে “এস্টিমেট বনাম প্রকৃত” দেখুন।")}
              </p>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
