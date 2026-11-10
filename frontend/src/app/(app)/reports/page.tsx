"use client";

import { ChartNoAxesCombined, ClipboardCheck, HandCoins, TrendingUp, Waves } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Guard, Page } from "@/components/shell";
import { Tabs, ease, rise } from "@/components/ui";
import { ROLES } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { CashflowReport } from "./cashflow";
import { EstimateReport } from "./estimate";
import { ProfitReport } from "./profit";
import { ReceivablesReport } from "./receivables";

type Tab = "profit" | "cashflow" | "eva" | "receivables";

export default function ReportsPage() {
  return <Guard roles={ROLES.FINANCE}><Reports /></Guard>;
}

function Reports() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("profit");
  const icon = (I: typeof Waves, label: string) => <span className="flex items-center gap-1.5"><I className="size-4" />{label}</span>;
  return (
    <Page
      eyebrow={<><ChartNoAxesCombined className="size-3.5" />{t("Management reports", "ব্যবস্থাপনা রিপোর্ট")}</>}
      title={t("Reports", "রিপোর্ট")}
      subtitle={t("Profit by source, the cash you will need in the coming months, where the budget stands and who still owes money.", "উৎস অনুযায়ী লাভ, আগামী মাসগুলোতে কত নগদ লাগবে, বাজেটের অবস্থা আর কার কাছে কত পাওনা।")}
    >
      <motion.div variants={rise} className="flex max-w-full">
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[
          { id: "profit", label: icon(TrendingUp, t("Profit", "লাভ")) },
          { id: "cashflow", label: icon(Waves, t("Cash flow forecast", "নগদ প্রবাহের পূর্বাভাস")) },
          { id: "eva", label: icon(ClipboardCheck, t("Estimate vs actual", "এস্টিমেট বনাম প্রকৃত")) },
          { id: "receivables", label: icon(HandCoins, t("Receivables", "পাওনা")) },
        ]} />
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease }} className="mt-5">
          {tab === "profit" && <ProfitReport />}
          {tab === "cashflow" && <CashflowReport />}
          {tab === "eva" && <EstimateReport />}
          {tab === "receivables" && <ReceivablesReport />}
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}
