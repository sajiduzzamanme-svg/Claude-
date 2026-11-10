"use client";

import { History, Search } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Avatar, Badge, Card, Empty, Input, Select, Skeleton, type Tone } from "@/components/ui";
import { qs, useList } from "@/lib/api";
import { digits } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { AuditRow } from "@/lib/types";

const ACTIONS: Record<string, { en: string; bn: string; tone: Tone }> = {
  receipt: { en: "Money received", bn: "টাকা গ্রহণ", tone: "leaf" },
  void_receipt: { en: "Receipt voided", bn: "রিসিট বাতিল", tone: "rose" },
  create_booking: { en: "Flat booked", bn: "ফ্ল্যাট বুকিং", tone: "sky" },
  cancel_booking: { en: "Booking cancelled", bn: "বুকিং বাতিল", tone: "rose" },
  refund: { en: "Refund paid", bn: "রিফান্ড প্রদান", tone: "brass" },
  handover: { en: "Flat handed over", bn: "ফ্ল্যাট হস্তান্তর", tone: "leaf" },
  transfer_booking: { en: "Name transfer", bn: "নাম পরিবর্তন", tone: "sky" },
  approve_price_revision: { en: "Price revision approved", bn: "দাম সংশোধন অনুমোদন", tone: "plum" },
  land_payment: { en: "Land payment", bn: "জমির পেমেন্ট", tone: "brass" },
  void_land_payment: { en: "Land payment voided", bn: "জমির পেমেন্ট বাতিল", tone: "rose" },
  register_land: { en: "Land registered", bn: "জমি রেজিস্ট্রি", tone: "plum" },
  land_mutation: { en: "Mutation recorded", bn: "নামজারি রেকর্ড", tone: "plum" },
  vendor_bill: { en: "Vendor bill", bn: "সরবরাহকারীর বিল", tone: "brick" },
  void_bill: { en: "Bill voided", bn: "বিল বাতিল", tone: "rose" },
  vendor_payment: { en: "Vendor paid", bn: "সরবরাহকারীকে পরিশোধ", tone: "brass" },
  void_vendor_payment: { en: "Vendor payment voided", bn: "পেমেন্ট বাতিল", tone: "rose" },
  approve_po: { en: "Purchase order approved", bn: "পারচেজ অর্ডার অনুমোদন", tone: "sky" },
  cancel_po: { en: "Purchase order cancelled", bn: "পারচেজ অর্ডার বাতিল", tone: "rose" },
  expense: { en: "Expense", bn: "খরচ", tone: "brass" },
  void_expense: { en: "Expense voided", bn: "খরচ বাতিল", tone: "rose" },
  manual_journal: { en: "Manual voucher", bn: "ম্যানুয়াল ভাউচার", tone: "ink" },
  reverse_journal: { en: "Voucher reversed", bn: "ভাউচার রিভার্স", tone: "rose" },
  approve_estimate: { en: "Estimate approved", bn: "এস্টিমেট অনুমোদন", tone: "plum" },
  open_sales: { en: "Sales opened", bn: "বিক্রি চালু", tone: "leaf" },
  close_sales: { en: "Sales closed", bn: "বিক্রি বন্ধ", tone: "neutral" },
  create_project: { en: "Project created", bn: "প্রজেক্ট তৈরি", tone: "sky" },
  convert_lead: { en: "Lead converted", bn: "লিড থেকে ক্রেতা", tone: "leaf" },
};

export function Activity() {
  const { t, date, lang, n } = useT();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(id);
  }, [typed]);
  const { rows, loading, data } = useList<AuditRow>(`/audit-log${qs({ page_size: 100, search, action })}`);
  const count = data && !Array.isArray(data) ? data.count : rows.length;

  const days = useMemo(() => {
    const map = new Map<string, AuditRow[]>();
    for (const r of rows) {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows]);
  const time = (iso: string) => {
    const d = new Date(iso);
    return digits(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, lang);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
          <Input className="pl-9" placeholder={t("Search by document number or text", "দলিল নম্বর বা লেখা দিয়ে খুঁজুন")} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
        <div className="w-60">
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">{t("Every kind of action", "সব ধরনের কাজ")}</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{t(v.en, v.bn)}</option>)}
          </Select>
        </div>
        <span className="text-sm text-mute">{t(`${count} entries`, `${n(count)}টি এন্ট্রি`)}{count > rows.length ? ` · ${t(`showing latest ${rows.length}`, `সাম্প্রতিক ${n(rows.length)}টি`)}` : ""}</span>
        <span className="ml-auto text-xs text-mute">{t("This log cannot be edited or deleted.", "এই লগ সম্পাদনা বা মুছে ফেলা যায় না।")}</span>
      </div>

      {loading ? <div className="space-y-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}</div> : rows.length === 0 ? (
        <Card><Empty icon={<History />} title={t("Nothing recorded yet", "এখনো কিছু রেকর্ড হয়নি")} /></Card>
      ) : (
        <div className="space-y-6">
          {days.map(([day, items]) => (
            <section key={day}>
              <h3 className="sticky top-0 z-10 mb-2 w-fit rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold shadow-card">{date(day)} <span className="ml-1 font-normal text-mute">· {n(items.length)}</span></h3>
              <ol className="relative ml-4 border-l-2 border-dashed border-line pl-6">
                {items.map((r, i) => {
                  const a = ACTIONS[r.action] ?? { en: r.action.replace(/_/g, " "), bn: r.action.replace(/_/g, " "), tone: "neutral" as Tone };
                  return (
                    <motion.li key={r.id} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: Math.min(i, 12) * 0.025 }} className="relative pb-3">
                      <span className="absolute -left-[31px] top-3.5 size-2.5 rounded-full border-2 border-paper bg-ink" />
                      <Card className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 transition hover:shadow-lift">
                        <span className="tnum w-11 shrink-0 text-xs font-medium text-mute">{time(r.created_at)}</span>
                        <Badge tone={a.tone}>{t(a.en, a.bn)}</Badge>
                        <span className="min-w-0 flex-1 basis-64 truncate text-sm" title={r.summary}>{r.summary}</span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-mute">{r.user_name ? <><Avatar name={r.user_name} size={22} />{r.user_name}</> : t("System", "সিস্টেম")}</span>
                      </Card>
                    </motion.li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
