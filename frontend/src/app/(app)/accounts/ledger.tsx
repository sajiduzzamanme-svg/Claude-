"use client";

import { BookOpenText, Check, Scale, X } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Spark } from "@/components/charts";
import { LABELS, ProjectSelect } from "@/components/forms";
import { Badge, Card, CountUp, Empty, Input, Select, Skeleton, Table, Td, Th, cn, ease } from "@/components/ui";
import { qs, useApi, useList } from "@/lib/api";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Account, Ledger, TrialBalance } from "@/lib/types";

const TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
const BAND: Record<Account["type"], string> = { ASSET: "bg-leaf", LIABILITY: "bg-brick", EQUITY: "bg-plum", INCOME: "bg-sky", EXPENSE: "bg-brass" };

export function LedgerView({ account, onAccount }: { account: string; onAccount: (v: string) => void }) {
  const { t, taka, date } = useT();
  const { rows: accounts } = useList<Account>("/accounts");
  const [f, setF] = useState({ project: "", from: "", to: "" });
  const { data, isLoading, error } = useApi<Ledger>(account ? `/reports/ledger${qs({ account, project: f.project, from: f.from, to: f.to })}` : null);
  const groups = useMemo(() => TYPES.map((type) => ({ type, items: accounts.filter((a) => a.type === type) })), [accounts]);
  const spark = useMemo(() => (data ? [num(data.opening), ...data.rows.map((r) => num(r.balance))] : []), [data]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-80">
          <Select value={account} onChange={(e) => onAccount(e.target.value)} aria-label={t("Account", "হিসাব")}>
            <option value="">{t("Choose an account", "একটি হিসাব বাছুন")}</option>
            {groups.map((g) => (
              <optgroup key={g.type} label={t(LABELS.account[g.type].en, LABELS.account[g.type].bn)}>
                {g.items.map((a) => <option key={a.id} value={a.id}>{a.code} · {t(a.name, a.name_bn || a.name)}</option>)}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="w-48"><ProjectSelect value={f.project} onChange={(v) => setF({ ...f, project: v })} all={t("All projects", "সব প্রজেক্ট")} /></div>
        <label className="flex items-center gap-2 text-sm text-mute">{t("From", "থেকে")}<Input type="date" className="w-40" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm text-mute">{t("To", "পর্যন্ত")}<Input type="date" className="w-40" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      </div>

      {!account ? (
        <Card><Empty icon={<BookOpenText />} title={t("Pick an account to read its ledger", "লেজার দেখতে একটি হিসাব বাছুন")} hint={t("Every movement in the account, in date order, with a running balance.", "হিসাবের প্রতিটি লেনদেন তারিখ অনুযায়ী, চলতি ব্যালেন্সসহ।")} /></Card>
      ) : error ? <Card><Empty title={error.message} /></Card> : isLoading || !data ? <Skeleton className="h-96" /> : (
        <motion.div key={data.account.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease }}>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-line p-5 sm:p-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className={cn("h-12 w-1.5 rounded-full", BAND[data.account.type])} />
                <div className="min-w-0">
                  <div className="tnum text-xs font-semibold text-mute">{data.account.code} · {t(LABELS.account[data.account.type].en, LABELS.account[data.account.type].bn)}</div>
                  <h2 className="truncate text-xl font-bold tracking-tight">{t(data.account.name, data.account.name_bn || data.account.name)}</h2>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-8">
                <Spark values={spark} width={140} height={40} color="var(--color-ink)" />
                <div className="text-right"><div className="text-xs text-mute">{t("Opening", "প্রারম্ভিক")}</div><div className="tnum font-semibold">{taka(data.opening, 2)}</div></div>
                <div className="text-right"><div className="text-xs text-mute">{t("Closing balance", "সমাপনী ব্যালেন্স")}</div><CountUp value={num(data.closing)} format={(v) => taka(v, 2)} className={cn("block text-2xl font-bold", num(data.closing) < 0 && "text-rose")} /></div>
              </div>
            </div>
            {data.rows.length === 0 ? <Empty title={t("No movement in this period", "এই সময়ে কোনো লেনদেন নেই")} /> : (
              <Table className="max-h-[640px] overflow-y-auto">
                <thead><tr><Th>{t("Date", "তারিখ")}</Th><Th>{t("Voucher", "ভাউচার")}</Th><Th>{t("Particulars", "বিবরণ")}</Th><Th right>{t("Debit", "ডেবিট")}</Th><Th right>{t("Credit", "ক্রেডিট")}</Th><Th right>{t("Balance", "ব্যালেন্স")}</Th></tr></thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 30) * 0.012 }} className="transition hover:bg-paper-deep/50">
                      <Td className="tnum whitespace-nowrap text-mute">{date(r.date)}</Td>
                      <Td className="tnum whitespace-nowrap text-[13px] font-medium">{r.number}</Td>
                      <Td><span className="block max-w-md truncate">{r.memo}</span><span className="text-xs text-mute">{[r.source_ref, r.project_code].filter(Boolean).join(" · ")}</span></Td>
                      <Td right>{num(r.debit) > 0 ? taka(r.debit, 2) : ""}</Td>
                      <Td right>{num(r.credit) > 0 ? taka(r.credit, 2) : ""}</Td>
                      <Td right className={cn("font-semibold", num(r.balance) < 0 && "text-rose")}>{taka(r.balance, 2)}</Td>
                    </motion.tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  );
}

export function TrialBalanceView() {
  const { t, taka, date } = useT();
  const [asOf, setAsOf] = useState("");
  const { data } = useApi<TrialBalance>(`/reports/trial-balance${qs({ as_of: asOf })}`);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-mute">{t("As of", "যে তারিখ পর্যন্ত")}<Input type="date" className="w-44" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
        {data && (
          <motion.span key={String(data.balanced)} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={cn("flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold", data.balanced ? "bg-leaf-wash text-leaf" : "bg-rose-wash text-rose")}>
            {data.balanced ? <Check className="size-4" /> : <X className="size-4" />}
            {data.balanced ? t("Debits equal credits", "ডেবিট = ক্রেডিট") : t("Debits and credits differ", "ডেবিট ও ক্রেডিট মেলেনি")}
          </motion.span>
        )}
        <span className="ml-auto text-sm text-mute">{asOf ? date(asOf) : t("All entries to date", "আজ পর্যন্ত সব এন্ট্রি")}</span>
      </div>
      {!data ? <Skeleton className="h-96" /> : data.rows.length === 0 ? <Card><Empty icon={<Scale />} title={t("No entries yet", "এখনো কোনো এন্ট্রি নেই")} /></Card> : (
        <Card className="overflow-hidden">
          <Table>
            <thead><tr><Th>{t("Code", "কোড")}</Th><Th>{t("Account", "হিসাব")}</Th><Th>{t("Type", "ধরন")}</Th><Th right>{t("Debit", "ডেবিট")}</Th><Th right>{t("Credit", "ক্রেডিট")}</Th></tr></thead>
            <tbody>
              {data.rows.map((r, i) => (
                <motion.tr key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, delay: i * 0.02 }} className="transition hover:bg-paper-deep/50">
                  <Td className="tnum text-mute"><span className="flex items-center gap-2.5"><i className={cn("h-5 w-1 rounded-full", BAND[r.type])} />{r.code}</span></Td>
                  <Td className="font-medium">{t(r.name, r.name_bn || r.name)}</Td>
                  <Td><Badge tone={LABELS.account[r.type].tone}>{t(LABELS.account[r.type].en, LABELS.account[r.type].bn)}</Badge></Td>
                  <Td right>{num(r.debit) > 0 ? taka(r.debit, 2) : ""}</Td>
                  <Td right>{num(r.credit) > 0 ? taka(r.credit, 2) : ""}</Td>
                </motion.tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-ink text-paper">
                <td colSpan={3} className="px-4 py-3 text-sm font-semibold uppercase tracking-[0.1em]">{t("Total", "মোট")}</td>
                <td className="tnum px-4 py-3 text-right text-base font-bold">{taka(data.total_debit, 2)}</td>
                <td className="tnum px-4 py-3 text-right text-base font-bold">{taka(data.total_credit, 2)}</td>
              </tr>
            </tfoot>
          </Table>
        </Card>
      )}
    </div>
  );
}
