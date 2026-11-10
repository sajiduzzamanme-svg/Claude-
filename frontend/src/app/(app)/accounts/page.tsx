"use client";

import { BookOpenText, Calculator, ListTree, Scale, ScrollText, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Guard, Page } from "@/components/shell";
import { Tabs, ease, rise } from "@/components/ui";
import { ROLES } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { ChartOfAccounts } from "./chart";
import { Journal } from "./journal";
import { LedgerView, TrialBalanceView } from "./ledger";
import { Overview } from "./overview";

type Tab = "overview" | "chart" | "journal" | "ledger" | "trial";

export default function AccountsPage() {
  return <Guard roles={ROLES.FINANCE}><Accounts /></Guard>;
}

function Accounts() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("overview");
  const [ledgerAccount, setLedgerAccount] = useState("");
  const icon = (I: typeof Scale, label: string) => <span className="flex items-center gap-1.5"><I className="size-4" />{label}</span>;

  return (
    <Page
      eyebrow={<><Calculator className="size-3.5" />{t("Double-entry books", "ডাবল-এন্ট্রি হিসাব")}</>}
      title={t("Accounts", "হিসাবরক্ষণ")}
      subtitle={t("Every receipt, bill and payment posts a balanced voucher here. Posted vouchers are never edited — only reversed.", "প্রতিটি রিসিট, বিল ও পেমেন্ট এখানে একটি ব্যালেন্সড ভাউচার পোস্ট করে। পোস্টেড ভাউচার কখনো বদলানো হয় না — শুধু রিভার্স হয়।")}
    >
      <motion.div variants={rise} className="flex max-w-full">
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[
          { id: "overview", label: icon(ShieldCheck, t("Overview", "সারসংক্ষেপ")) },
          { id: "chart", label: icon(ListTree, t("Chart of accounts", "হিসাবের তালিকা")) },
          { id: "journal", label: icon(ScrollText, t("Journal", "জার্নাল")) },
          { id: "ledger", label: icon(BookOpenText, t("Ledger", "লেজার")) },
          { id: "trial", label: icon(Scale, t("Trial balance", "রেওয়ামিল")) },
        ]} />
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease }} className="mt-5">
          {tab === "overview" && <Overview />}
          {tab === "chart" && <ChartOfAccounts onOpenLedger={(id) => { setLedgerAccount(String(id)); setTab("ledger"); }} />}
          {tab === "journal" && <Journal />}
          {tab === "ledger" && <LedgerView account={ledgerAccount} onAccount={setLedgerAccount} />}
          {tab === "trial" && <TrialBalanceView />}
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}
