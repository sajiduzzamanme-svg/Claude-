"use client";

import { Banknote, Check, Equal, Landmark, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Dot } from "@/components/finance-parts";
import { Button, Card, CountUp, SectionTitle, Skeleton, cn, ease, stagger, rise } from "@/components/ui";
import { useApi, useList } from "@/lib/api";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Account, Integrity, TrialBalance } from "@/lib/types";

const CASH_ICON: Record<string, typeof Banknote> = { CASH: Banknote, BANK: Landmark, MOBILE: Smartphone };

export function Overview() {
  const { t, taka, short } = useT();
  const { rows: cash, loading } = useList<Account>("/accounts/cash");
  const { data: tb } = useApi<TrialBalance>("/reports/trial-balance");
  const totalCash = cash.reduce((a, c) => a + num(c.balance), 0);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      {/* ---------- cash & bank ---------- */}
      <motion.section variants={rise} className="bg-grid-night relative overflow-hidden rounded-3xl bg-night p-5 text-paper shadow-lift sm:p-7">
        <div className="pointer-events-none absolute -left-10 -top-20 size-72 rounded-full bg-leaf/25 blur-[110px]" />
        <div className="relative grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-paper/45">{t("Money available now", "এই মুহূর্তে হাতে থাকা টাকা")}</p>
            <CountUp value={totalCash} format={short} className="mt-2 block text-[48px] font-bold leading-none tracking-tight" />
            <p className="tnum mt-2 text-sm text-paper/50">{taka(totalCash)}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {loading && [0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-white/5" />)}
            {cash.map((a, i) => {
              const Icon = CASH_ICON[a.system_key ?? ""] ?? Landmark;
              return (
                <motion.div key={a.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.15 + i * 0.1 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] p-4 transition hover:bg-white/[0.08]">
                  <div className="flex items-center gap-2 text-[13px] text-paper/60"><Icon className="size-4 text-brass" />{t(a.name, a.name_bn)}</div>
                  <div className={cn("tnum mt-2 text-2xl font-semibold", num(a.balance) < 0 && "text-[#ff8f86]")}>{short(a.balance)}</div>
                  <div className="tnum mt-0.5 text-xs text-paper/40">{a.code}</div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.section>

      <div className="grid gap-5 xl:grid-cols-2">
        <motion.div variants={rise}><Equation tb={tb} /></motion.div>
        <motion.div variants={rise}><BooksAudit /></motion.div>
      </div>
    </motion.div>
  );
}

function Equation({ tb }: { tb?: TrialBalance }) {
  const { t, taka, short } = useT();
  if (!tb) return <Skeleton className="h-96" />;
  const s = tb.summary;
  const assets = num(s.assets), liabilities = num(s.liabilities), equity = num(s.equity), profit = num(s.net_profit);
  const right = liabilities + equity + profit;
  const holds = Math.abs(assets - right) < 0.005;
  const scale = Math.max(assets, liabilities + equity + Math.max(profit, 0), 1);
  const parts = [
    { label: t("Owed to others", "অন্যদের কাছে দায়"), hint: t("customer advances, vendors, landowners", "ক্রেতার অগ্রিম, সরবরাহকারী, জমির মালিক"), value: liabilities, color: "var(--color-brick)" },
    { label: t("Owner's capital", "মালিকের মূলধন"), hint: t("money the owners put in", "মালিকের বিনিয়োগ"), value: equity, color: "var(--color-plum)" },
    { label: profit >= 0 ? t("Profit so far", "এ পর্যন্ত লাভ") : t("Loss so far", "এ পর্যন্ত ক্ষতি"), hint: `${t("income", "আয়")} ${short(s.income)} − ${t("expenses", "ব্যয়")} ${short(s.expenses)}`, value: profit, color: profit >= 0 ? "var(--color-leaf)" : "var(--color-rose)" },
  ];
  return (
    <Card className="h-full p-5 sm:p-6">
      <SectionTitle hint={t("What the company has must equal where it came from", "কোম্পানির যা আছে তা অবশ্যই উৎসের সমান হবে")}
        action={<span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", holds ? "bg-leaf-wash text-leaf" : "bg-rose-wash text-rose")}>{holds ? <Check className="size-3.5" /> : <X className="size-3.5" />}{holds ? t("Balanced", "মিলেছে") : t("Does not balance", "মেলেনি")}</span>}>
        {t("The accounting equation", "হিসাব সমীকরণ")}
      </SectionTitle>

      <div className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-sm"><span className="font-medium">{t("What we have (assets)", "আমাদের যা আছে (সম্পদ)")}</span><span className="tnum font-bold">{taka(assets)}</span></div>
          <div className="h-9 overflow-hidden rounded-xl bg-paper-deep">
            <motion.div className="h-full rounded-xl bg-ink" initial={{ width: 0 }} animate={{ width: `${(assets / scale) * 100}%` }} transition={{ duration: 1, ease }} />
          </div>
        </div>
        <div className="grid place-items-center"><span className={cn("grid size-8 place-items-center rounded-full", holds ? "bg-leaf text-white" : "bg-rose text-white")}><Equal className="size-4" /></span></div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-sm"><span className="font-medium">{t("Where it came from", "যেখান থেকে এসেছে")}</span><span className="tnum font-bold">{taka(right)}</span></div>
          <div className="flex h-9 gap-[3px] overflow-hidden rounded-xl bg-paper-deep">
            {parts.map((p, i) => (
              <motion.div key={p.label} className="h-full first:rounded-l-xl last:rounded-r-xl" style={{ background: p.color }}
                initial={{ width: 0 }} animate={{ width: `${(Math.max(p.value, 0) / scale) * 100}%` }} transition={{ duration: 0.9, ease, delay: 0.25 + i * 0.15 }} />
            ))}
          </div>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-line/70">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <span className="flex min-w-0 items-center gap-2.5"><Dot color={p.color} /><span className="min-w-0"><span className="block font-medium">{p.label}</span><span className="block truncate text-xs text-mute">{p.hint}</span></span></span>
            <span className={cn("tnum font-semibold", p.value < 0 && "text-rose")}>{taka(p.value)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-mute">
        {t("Customer payments stay under “owed to others” until the flat is handed over; only then do they count as income.", "ফ্ল্যাট হস্তান্তরের আগে পর্যন্ত ক্রেতার টাকা “দায়” হিসেবে থাকে; হস্তান্তরের পরেই তা আয় হিসেবে গণ্য হয়।")}
      </p>
    </Card>
  );
}

/** Ledger vs sub-ledger checks, revealed one by one like an auditor ticking a list. */
function BooksAudit() {
  const { t, n } = useT();
  const { data, mutate, isValidating } = useApi<Integrity>("/reports/integrity");
  const [run, setRun] = useState(0);
  const failed = data?.checks.filter((c) => !c.ok) ?? [];
  const total = data?.checks.length ?? 0;
  const step = 0.07;

  return (
    <Card className="h-full overflow-hidden">
      <div className={cn("flex items-center gap-4 border-b border-line p-5 sm:p-6", data && (data.ok ? "bg-leaf-wash/60" : "bg-rose-wash/70"))}>
        <motion.span key={`${run}-${data?.ok}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: total * step }}
          className={cn("grid size-14 shrink-0 place-items-center rounded-2xl", !data ? "bg-paper-deep text-mute" : data.ok ? "bg-leaf text-white" : "bg-rose text-white")}>
          {data && !data.ok ? <ShieldAlert className="size-7" /> : <ShieldCheck className="size-7" />}
        </motion.span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">{t("Books audit", "হিসাব যাচাই")}</h2>
          <p className="text-[13px] text-ink-soft">
            {!data ? t("Checking…", "যাচাই চলছে…") : data.ok
              ? t(`All ${total} checks pass: the ledger and the detailed records agree.`, `${n(total)}টি যাচাইয়ের সবগুলো উত্তীর্ণ: লেজার ও বিস্তারিত রেকর্ড মিলে গেছে।`)
              : t(`${failed.length} of ${total} checks failed. Investigate before relying on the reports.`, `${n(total)}টির মধ্যে ${n(failed.length)}টি ব্যর্থ। রিপোর্টে ভরসা করার আগে খতিয়ে দেখুন।`)}
          </p>
        </div>
        <Button size="sm" variant="outline" loading={isValidating} icon={!isValidating && <RefreshCw className="size-4" />} onClick={async () => { await mutate(); setRun((r) => r + 1); }}>{t("Run again", "আবার চালান")}</Button>
      </div>
      <div className="h-1 bg-paper-deep">
        {data && <motion.div key={run} className={cn("h-full", data.ok ? "bg-leaf" : "bg-rose")} initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: total * step + 0.2, ease: "linear" }} />}
      </div>
      {!data ? <div className="space-y-2 p-5">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-7" />)}</div> : (
        <ul key={run} className="scroll-thin max-h-[440px] overflow-y-auto px-3 py-2 sm:px-4">
          {data.checks.map((c, i) => (
            <motion.li key={c.key} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, delay: i * step }}
              className={cn("flex items-start gap-3 rounded-xl px-2.5 py-2 text-[13.5px]", !c.ok && "bg-rose-wash")}>
              <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 18, delay: i * step + 0.12 }}
                className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white", c.ok ? "bg-leaf" : "bg-rose")}>
                {c.ok ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
              </motion.span>
              <span className="min-w-0 flex-1">
                <span className={cn(!c.ok && "font-medium text-rose")}>{t(c.title, c.title_bn)}</span>
                {!c.ok && <span className="tnum mt-0.5 block text-xs text-rose/90">{t("expected", "প্রত্যাশিত")} {c.expected} · {t("found", "পাওয়া গেছে")} {c.actual}{c.detail ? ` · ${c.detail}` : ""}</span>}
              </span>
            </motion.li>
          ))}
        </ul>
      )}
    </Card>
  );
}
