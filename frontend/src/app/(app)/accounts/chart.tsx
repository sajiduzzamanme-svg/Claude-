"use client";

import { BookOpenText, Landmark, Lock, Pencil, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useOnOpen } from "@/components/finance-parts";
import { LABELS } from "@/components/forms";
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, Select, Skeleton, cn, rise, stagger, useAction } from "@/components/ui";
import { api, refreshAll, useList } from "@/lib/api";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Account } from "@/lib/types";

const TYPES: Account["type"][] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
const BAND: Record<Account["type"], string> = { ASSET: "bg-leaf", LIABILITY: "bg-brick", EQUITY: "bg-plum", INCOME: "bg-sky", EXPENSE: "bg-brass" };
const RANGE: Record<Account["type"], string> = { ASSET: "1000–1999", LIABILITY: "2000–2999", EQUITY: "3000–3999", INCOME: "4000–4999", EXPENSE: "5000–6999" };

export function ChartOfAccounts({ onOpenLedger }: { onOpenLedger: (id: number) => void }) {
  const { t, taka, short } = useT();
  const { rows, loading } = useList<Account>("/accounts");
  const [editing, setEditing] = useState<Account | "new" | null>(null);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-mute"><Lock className="size-4 text-brass" />{t("Locked accounts are kept by the system from receipts, bills and payments, so they always match the detailed records.", "তালা-চিহ্নিত হিসাব সিস্টেম নিজেই রিসিট, বিল ও পেমেন্ট থেকে রাখে — তাই এগুলো সবসময় বিস্তারিত রেকর্ডের সাথে মেলে।")}</p>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>{t("Add account", "হিসাব যোগ করুন")}</Button>
      </div>

      {loading ? <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}</div> : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-2">
          {TYPES.map((type) => {
            const items = rows.filter((a) => a.type === type);
            const total = items.reduce((a, x) => a + num(x.balance), 0);
            const def = LABELS.account[type];
            return (
              <motion.div key={type} variants={rise} className={cn("min-w-0", type === "EXPENSE" && "lg:col-span-2")}>
                <Card className="overflow-hidden">
                  <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
                    <span className={cn("h-9 w-1.5 rounded-full", BAND[type])} />
                    <div className="min-w-0 flex-1"><h3 className="font-semibold leading-tight">{t(def.en, def.bn)}</h3><p className="tnum text-xs text-mute">{RANGE[type]}</p></div>
                    <span className="tnum text-lg font-bold" title={taka(total)}>{short(total)}</span>
                  </header>
                  <ul className={cn("divide-y divide-line/60", type === "EXPENSE" && "lg:grid lg:grid-cols-2 lg:divide-y-0")}>
                    {items.map((a) => (
                      <li key={a.id} className={cn("group flex items-center gap-3 px-5 py-2.5 text-sm transition hover:bg-paper-deep/50", !a.is_active && "opacity-50", type === "EXPENSE" && "lg:border-b lg:border-line/60")}>
                        <span className="tnum w-11 shrink-0 text-xs font-semibold text-mute">{a.code}</span>
                        <button onClick={() => onOpenLedger(a.id)} className="min-w-0 flex-1 truncate text-left font-medium hover:text-brick hover:underline" title={t("Open ledger", "লেজার দেখুন")}>{t(a.name, a.name_bn || a.name)}</button>
                        {a.is_cash_bank && <Landmark className="size-3.5 shrink-0 text-sky" aria-label={t("Cash or bank account", "নগদ/ব্যাংক হিসাব")} />}
                        {a.is_control && <span title={t("Maintained by the system from source documents", "সিস্টেম নিজে মূল দলিল থেকে রাখে")}><Lock className="size-3.5 shrink-0 text-brass" /></span>}
                        <span className={cn("tnum w-24 shrink-0 text-right font-semibold sm:w-28", num(a.balance) === 0 && "font-normal text-mute", num(a.balance) < 0 && "text-rose")}>{taka(a.balance)}</span>
                        <span className="flex shrink-0 justify-end gap-0.5 opacity-40 transition group-hover:opacity-100 focus-within:opacity-100 sm:w-14">
                          <button onClick={() => onOpenLedger(a.id)} aria-label={t("Open ledger", "লেজার দেখুন")} className="hidden size-7 place-items-center rounded-md text-mute hover:bg-paper-deep hover:text-ink sm:grid"><BookOpenText className="size-3.5" /></button>
                          <button onClick={() => setEditing(a)} aria-label={t("Rename", "নাম বদলান")} className="grid size-7 place-items-center rounded-md text-mute hover:bg-paper-deep hover:text-ink"><Pencil className="size-3.5" /></button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
      <AccountModal target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function AccountModal({ target, onClose }: { target: Account | "new" | null; onClose: () => void }) {
  const { t } = useT();
  const { busy, error, run, setError } = useAction();
  const editing = target && target !== "new" ? target : null;
  const system = !!editing?.system_key;
  const [f, setF] = useState({ code: "", name: "", name_bn: "", type: "EXPENSE", is_cash_bank: false, is_active: true });
  useOnOpen(target, (a) => {
    setError("");
    setF(a !== "new" ? { code: a.code, name: a.name, name_bn: a.name_bn, type: a.type, is_cash_bank: a.is_cash_bank, is_active: a.is_active }
      : { code: "", name: "", name_bn: "", type: "EXPENSE", is_cash_bank: false, is_active: true });
  });

  async function save() {
    const ok = await run(async () => {
      if (editing) await api.patch(`/accounts/${editing.id}`, system ? { name: f.name, name_bn: f.name_bn } : { ...f, is_cash_bank: f.type === "ASSET" && f.is_cash_bank });
      else await api.post("/accounts", { ...f, is_cash_bank: f.type === "ASSET" && f.is_cash_bank });
      await refreshAll();
      return true;
    }, editing ? t("Account updated", "হিসাব আপডেট হয়েছে") : t("Account added", "হিসাব যোগ হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={!!target} onClose={onClose} title={editing ? t("Edit account", "হিসাব সম্পাদনা") : t("Add account", "হিসাব যোগ করুন")}
      subtitle={system ? t("A system account can be renamed but its code and type are fixed.", "সিস্টেম হিসাবের নাম বদলানো যায়, কিন্তু কোড ও ধরন স্থির।") : t("For example a second bank account, a loan, or a new expense heading.", "যেমন দ্বিতীয় ব্যাংক হিসাব, ঋণ বা নতুন খরচের শিরোনাম।")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button><Button loading={busy} disabled={!f.code.trim() || !f.name.trim()} onClick={save}>{t("Save", "সেভ করুন")}</Button></>}>
      <div className="space-y-4">
        {system && <Badge tone="brass"><Lock className="size-3" />{t("System account", "সিস্টেম হিসাব")}</Badge>}
        <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
          <Field label={t("Code", "কোড")} required><Input className="tnum" disabled={system} value={f.code} maxLength={10} onChange={(e) => setF({ ...f, code: e.target.value.replace(/[^\dA-Za-z-]/g, "") })} placeholder="1011" /></Field>
          <Field label={t("Type", "ধরন")} required>
            <Select disabled={system} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {TYPES.map((x) => <option key={x} value={x}>{t(LABELS.account[x].en, LABELS.account[x].bn)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Name (English)", "নাম (ইংরেজি)")} required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={t("Name (Bangla)", "নাম (বাংলা)")}><Input value={f.name_bn} onChange={(e) => setF({ ...f, name_bn: e.target.value })} /></Field>
        </div>
        {!system && f.type === "ASSET" && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-brick" checked={f.is_cash_bank} onChange={(e) => setF({ ...f, is_cash_bank: e.target.checked })} />
            <span><b className="font-medium">{t("Cash or bank account", "নগদ বা ব্যাংক হিসাব")}</b><span className="block text-xs text-mute">{t("Money can be received into it and paid out of it.", "এতে টাকা জমা ও এখান থেকে পরিশোধ করা যাবে।")}</span></span>
          </label>
        )}
        {editing && !system && (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" className="size-4 accent-brick" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
            {t("Active", "সক্রিয়")}
          </label>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
