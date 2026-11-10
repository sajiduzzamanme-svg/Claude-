"use client";

import { Check, Plus, RotateCcw, ScrollText, Search, Trash2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Chevron, Collapse, useOnOpen } from "@/components/finance-parts";
import { LABELS, ProjectSelect } from "@/components/forms";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Select, Skeleton, Textarea, cn, ease, useAction, type Tone } from "@/components/ui";
import { api, qs, refreshAll, useList } from "@/lib/api";
import { cleanMoney, num, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Account, JournalEntry } from "@/lib/types";

const SOURCES: Record<string, { en: string; bn: string; tone: Tone }> = {
  manual: { en: "Manual voucher", bn: "ম্যানুয়াল ভাউচার", tone: "ink" },
  Receipt: { en: "Customer receipt", bn: "ক্রেতার রিসিট", tone: "leaf" },
  VendorBill: { en: "Vendor bill", bn: "সরবরাহকারীর বিল", tone: "brick" },
  VendorPayment: { en: "Vendor payment", bn: "সরবরাহকারীকে পরিশোধ", tone: "brass" },
  Expense: { en: "Expense", bn: "খরচ", tone: "brass" },
  LandPayment: { en: "Land payment", bn: "জমির পেমেন্ট", tone: "plum" },
  LandRegistration: { en: "Land registration", bn: "জমি রেজিস্ট্রি", tone: "plum" },
  Handover: { en: "Flat handover", bn: "ফ্ল্যাট হস্তান্তর", tone: "sky" },
  Cancellation: { en: "Booking cancelled", bn: "বুকিং বাতিল", tone: "rose" },
  RefundPayment: { en: "Refund", bn: "রিফান্ড", tone: "rose" },
  BookingTransfer: { en: "Name transfer", bn: "নাম পরিবর্তন", tone: "sky" },
};

export function Journal() {
  const { t, n } = useT();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [source, setSource] = useState("");
  const [creating, setCreating] = useState(false);
  const [reversing, setReversing] = useState<JournalEntry | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(id);
  }, [typed]);
  const { rows, loading, data } = useList<JournalEntry>(`/journal${qs({ page_size: 50, search, project, source_type: source })}`);
  const count = data && !Array.isArray(data) ? data.count : rows.length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
          <Input className="pl-9" placeholder={t("Voucher no., memo or document no.", "ভাউচার নং, বিবরণ বা দলিল নং")} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
        <div className="w-48"><ProjectSelect value={project} onChange={setProject} all={t("All projects", "সব প্রজেক্ট")} /></div>
        <div className="w-52">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{t("All kinds of entry", "সব ধরনের এন্ট্রি")}</option>
            {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{t(v.en, v.bn)}</option>)}
          </Select>
        </div>
        <span className="text-sm text-mute">{t(`${count} vouchers`, `${n(count)}টি ভাউচার`)}{count > rows.length ? ` · ${t(`showing latest ${rows.length}`, `সাম্প্রতিক ${n(rows.length)}টি`)}` : ""}</span>
        <Button className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>{t("New voucher", "নতুন ভাউচার")}</Button>
      </div>

      {loading ? <div className="space-y-2.5">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16" />)}</div> : rows.length === 0 ? (
        <Card><Empty icon={<ScrollText />} title={t("No vouchers match", "কোনো ভাউচার পাওয়া যায়নি")} /></Card>
      ) : (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {rows.map((e, i) => <Voucher key={e.id} e={e} index={i} onReverse={() => setReversing(e)} />)}
          </AnimatePresence>
        </div>
      )}

      <VoucherModal open={creating} onClose={() => setCreating(false)} />
      <ReverseModal entry={reversing} onClose={() => setReversing(null)} />
    </div>
  );
}

function Voucher({ e, index, onReverse }: { e: JournalEntry; index: number; onReverse: () => void }) {
  const { t, taka, date } = useT();
  const [open, setOpen] = useState(false);
  const src = SOURCES[e.source_type] ?? { en: e.source_type, bn: e.source_type, tone: "neutral" as Tone };
  const canReverse = e.source_type === "manual" && !e.is_reversed && !e.reverses_number;
  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease, delay: Math.min(index, 14) * 0.025 }}>
      <Card className={cn("overflow-hidden transition-shadow hover:shadow-lift", (e.is_reversed || e.reverses_number) && "border-dashed")}>
        <button type="button" onClick={() => setOpen((s) => !s)} className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5">
          <span className="tnum w-[116px] shrink-0"><span className="block text-[13px] font-semibold">{e.number}</span><span className="block text-xs text-mute">{date(e.date)}</span></span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm font-medium", e.is_reversed && "text-mute line-through")}>{e.memo}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-mute">
              <Badge tone={src.tone}>{t(src.en, src.bn)}{e.source_ref ? ` · ${e.source_ref}` : ""}</Badge>
              {e.project_code && <Badge tone="neutral">{e.project_code}</Badge>}
              {e.is_reversed && <Badge tone="rose">{t("Reversed", "রিভার্সড")}</Badge>}
              {e.reverses_number && <Badge tone="rose">{t("Reverses", "রিভার্সাল —")} {e.reverses_number}</Badge>}
            </span>
          </span>
          <span className="tnum hidden whitespace-nowrap text-sm font-semibold sm:block">{taka(e.total)}</span>
          <Chevron open={open} />
        </button>
        <Collapse open={open}>
          <div className="border-t border-line bg-paper/60 px-4 py-3 sm:px-5">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-mute">
              <span>{t("Account", "হিসাব")}</span><span className="w-28 text-right">{t("Debit", "ডেবিট")}</span><span className="w-28 text-right">{t("Credit", "ক্রেডিট")}</span>
            </div>
            <ul className="mt-1 divide-y divide-line/60">
              {e.lines.map((l) => (
                <li key={l.id} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 py-1.5 text-[13.5px]">
                  <span className={cn("min-w-0", num(l.credit) > 0 && "pl-6")}>
                    <span className="tnum mr-2 text-xs text-mute">{l.account_code}</span>{t(l.account_name, l.account_name_bn || l.account_name)}
                    {(l.cost_head_name || l.description) && <span className="block truncate text-xs text-mute">{[l.cost_head_name, l.description].filter(Boolean).join(" · ")}</span>}
                  </span>
                  <span className="tnum w-28 text-right font-medium">{num(l.debit) > 0 ? taka(l.debit, 2) : ""}</span>
                  <span className="tnum w-28 text-right font-medium">{num(l.credit) > 0 ? taka(l.credit, 2) : ""}</span>
                </li>
              ))}
              <li className="grid grid-cols-[1fr_auto_auto] gap-x-4 pt-2 text-[13.5px] font-bold">
                <span className="flex items-center gap-1.5 text-leaf"><Check className="size-4" />{t("Balanced", "মিলেছে")}</span>
                <span className="tnum w-28 border-t-2 border-ink pt-1 text-right">{taka(e.total, 2)}</span><span className="tnum w-28 border-t-2 border-ink pt-1 text-right">{taka(e.total, 2)}</span>
              </li>
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-mute">
              <span>{e.created_by_name ? `${t("Posted by", "পোস্ট করেছেন")} ${e.created_by_name}` : t("Posted by the system", "সিস্টেম পোস্ট করেছে")}</span>
              {canReverse
                ? <Button size="sm" variant="outline" icon={<RotateCcw className="size-3.5" />} onClick={onReverse}>{t("Reverse this voucher", "ভাউচার রিভার্স করুন")}</Button>
                : e.source_type !== "manual" && <span>{t("To undo this, void the document that created it.", "এটি বাতিল করতে যে দলিল থেকে এসেছে সেটি বাতিল করুন।")}</span>}
            </div>
          </div>
        </Collapse>
      </Card>
    </motion.div>
  );
}

function ReverseModal({ entry, onClose }: { entry: JournalEntry | null; onClose: () => void }) {
  const { t } = useT();
  const { busy, error, run, setError } = useAction();
  const [reason, setReason] = useState("");
  useOnOpen(entry, () => { setReason(""); setError(""); });
  return (
    <Modal open={!!entry} onClose={onClose} size="sm" title={t(`Reverse ${entry?.number ?? ""}`, `${entry?.number ?? ""} রিভার্স`)}
      subtitle={t("A mirror-image voucher is posted today. The original stays in the books.", "আজকের তারিখে একটি বিপরীত ভাউচার পোস্ট হবে। মূল ভাউচার হিসাবে থেকে যাবে।")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Keep it", "থাক")}</Button>
        <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={async () => {
          const ok = await run(async () => { await api.post(`/journal/${entry!.id}/reverse`, { reason: reason.trim() }); await refreshAll(); return true; }, t("Voucher reversed", "ভাউচার রিভার্স হয়েছে"));
          if (ok) onClose();
        }}>{t("Reverse", "রিভার্স করুন")}</Button></>}>
      <div className="space-y-3">
        <Field label={t("Reason", "কারণ")} required><Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

type Row = { account: string; description: string; debit: string; credit: string };
const blankRow = (): Row => ({ account: "", description: "", debit: "", credit: "" });
const TEMPLATES = [
  { en: "Owner adds capital", bn: "মালিকের মূলধন জমা", dr: "BANK", cr: "CAPITAL" },
  { en: "Cash withdrawn from bank", bn: "ব্যাংক থেকে নগদ উত্তোলন", dr: "CASH", cr: "BANK" },
  { en: "Cash deposited to bank", bn: "ব্যাংকে নগদ জমা", dr: "BANK", cr: "CASH" },
  { en: "Loan received", bn: "ঋণ গ্রহণ", dr: "BANK", cr: "LOAN" },
  { en: "Bank charge", bn: "ব্যাংক চার্জ", dr: "BANK_CHARGES", cr: "BANK" },
  { en: "Owner's drawing", bn: "মালিকের উত্তোলন", dr: "DRAWINGS", cr: "BANK" },
];

function VoucherModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const { rows: accounts } = useList<Account>("/accounts");
  const [head, setHead] = useState({ date: today(), memo: "", project: "" });
  const [rows, setRows] = useState<Row[]>([blankRow(), blankRow()]);
  useOnOpen(open, () => { setHead({ date: today(), memo: "", project: "" }); setRows([blankRow(), blankRow()]); setError(""); });

  const groups = useMemo(() => (["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const).map((type) => ({ type, items: accounts.filter((a) => a.type === type && a.is_active) })), [accounts]);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const debit = rows.reduce((a, r) => a + num(r.debit), 0);
  const credit = rows.reduce((a, r) => a + num(r.credit), 0);
  const diff = Math.round((debit - credit) * 100) / 100;
  const used = rows.filter((r) => r.account && (num(r.debit) > 0 || num(r.credit) > 0));
  const balanced = diff === 0 && debit > 0;
  const valid = balanced && used.length >= 2 && head.memo.trim() && head.date;

  function applyTemplate(tp: (typeof TEMPLATES)[number]) {
    const id = (key: string) => String(accounts.find((a) => a.system_key === key)?.id ?? "");
    setRows([{ ...blankRow(), account: id(tp.dr), debit: rows[0]?.debit || "" }, { ...blankRow(), account: id(tp.cr), credit: rows[0]?.debit || rows[1]?.credit || "" }]);
    setHead((h) => ({ ...h, memo: h.memo || tp.en }));
  }

  async function save() {
    const ok = await run(async () => {
      await api.post("/journal", {
        date: head.date, memo: head.memo.trim(), project: head.project ? Number(head.project) : null,
        lines: used.map((r) => ({ account: Number(r.account), debit: r.debit || "0", credit: r.credit || "0", description: r.description })),
      });
      await refreshAll();
      return true;
    }, t("Voucher posted", "ভাউচার পোস্ট হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title={t("New journal voucher", "নতুন জার্নাল ভাউচার")}
      subtitle={t("For capital, loans, bank transfers and charges. Sales, land and vendor accounts are posted from their own screens.", "মূলধন, ঋণ, ব্যাংক ট্রান্সফার ও চার্জের জন্য। বিক্রি, জমি ও সরবরাহকারীর হিসাব নিজ নিজ স্ক্রিন থেকে পোস্ট হয়।")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button><Button loading={busy} disabled={!valid} onClick={save}>{t("Post voucher", "ভাউচার পোস্ট করুন")}</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((tp) => (
            <button key={tp.en} type="button" onClick={() => applyTemplate(tp)} className="rounded-full border border-line bg-card px-3 py-1 text-xs font-medium transition hover:border-ink hover:bg-brass-wash">{t(tp.en, tp.bn)}</button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr_220px]">
          <Field label={t("Date", "তারিখ")} required><Input type="date" value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} /></Field>
          <Field label={t("What happened", "কী ঘটেছে")} required><Input value={head.memo} onChange={(e) => setHead({ ...head, memo: e.target.value })} placeholder={t("e.g. Owner's capital introduced", "যেমন: মালিকের মূলধন জমা")} /></Field>
          <Field label={t("Project", "প্রজেক্ট")}><ProjectSelect value={head.project} onChange={(v) => setHead({ ...head, project: v })} all={t("Not for one project", "নির্দিষ্ট প্রজেক্ট নয়")} /></Field>
        </div>

        <div className="rounded-2xl border border-line">
          <div className="hidden grid-cols-[1.4fr_1.2fr_130px_130px_36px] gap-2 border-b border-line bg-paper/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute md:grid">
            <span>{t("Account", "হিসাব")}</span><span>{t("Note", "নোট")}</span><span className="text-right">{t("Debit", "ডেবিট")}</span><span className="text-right">{t("Credit", "ক্রেডিট")}</span><span />
          </div>
          <div className="divide-y divide-line/70">
            {rows.map((r, i) => (
              <motion.div key={i} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-2 p-3 md:grid-cols-[1.4fr_1.2fr_130px_130px_36px]">
                <Select className="col-span-2 md:col-span-1" value={r.account} onChange={(e) => set(i, { account: e.target.value })} aria-label={t("Account", "হিসাব")}>
                  <option value="">{t("Choose account", "হিসাব বাছুন")}</option>
                  {groups.map((g) => (
                    <optgroup key={g.type} label={t(LABELS.account[g.type].en, LABELS.account[g.type].bn)}>
                      {g.items.map((a) => <option key={a.id} value={a.id} disabled={a.is_control}>{a.code} · {t(a.name, a.name_bn || a.name)}{a.is_control ? ` — ${t("system", "সিস্টেম")}` : ""}</option>)}
                    </optgroup>
                  ))}
                </Select>
                <Input className="col-span-2 md:col-span-1" placeholder={t("Note", "নোট")} value={r.description} onChange={(e) => set(i, { description: e.target.value })} />
                <Input className="tnum text-right" inputMode="decimal" placeholder={t("Debit", "ডেবিট")} value={r.debit} onChange={(e) => set(i, { debit: cleanMoney(e.target.value), credit: "" })} />
                <Input className="tnum text-right" inputMode="decimal" placeholder={t("Credit", "ক্রেডিট")} value={r.credit} onChange={(e) => set(i, { credit: cleanMoney(e.target.value), debit: "" })} />
                <button type="button" onClick={() => setRows(rows.length > 2 ? rows.filter((_, j) => j !== i) : rows.map((x, j) => (j === i ? blankRow() : x)))} aria-label={t("Remove line", "লাইন মুছুন")} className="col-span-2 grid h-10 place-items-center rounded-lg text-mute transition hover:bg-rose-wash hover:text-rose md:col-span-1"><Trash2 className="size-4" /></button>
              </motion.div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper/70 px-3 py-2.5">
            <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setRows([...rows, blankRow()])}>{t("Add line", "লাইন যোগ করুন")}</Button>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-mute">{t("Debit", "ডেবিট")} <b className="tnum ml-1 text-ink">{taka(debit, 2)}</b></span>
              <span className="text-mute">{t("Credit", "ক্রেডিট")} <b className="tnum ml-1 text-ink">{taka(credit, 2)}</b></span>
              <motion.span key={String(balanced)} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", balanced ? "bg-leaf-wash text-leaf" : "bg-rose-wash text-rose")}>
                {balanced ? <><Check className="size-3.5" />{t("Balanced", "মিলেছে")}</> : <><TriangleAlert className="size-3.5" />{debit === 0 && credit === 0 ? t("Enter amounts", "টাকা লিখুন") : `${t("Out by", "অমিল")} ${taka(Math.abs(diff), 2)}`}</>}
              </motion.span>
            </div>
          </div>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
