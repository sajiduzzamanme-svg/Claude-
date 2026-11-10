"use client";

import { ClipboardList, FileClock, ReceiptText, ShieldHalf, ShoppingCart, Store } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Stat } from "@/components/finance-parts";
import { Guard, Page } from "@/components/shell";
import { Tabs, ease, stagger } from "@/components/ui";
import { useList } from "@/lib/api";
import { ROLES } from "@/lib/auth";
import { daysFromToday, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { PurchaseOrder, Vendor, VendorBill } from "@/lib/types";
import { Bills } from "./bills";
import { Orders } from "./orders";
import { Vendors } from "./vendors";

type Tab = "orders" | "bills" | "vendors";

export default function ProcurementPage() {
  return <Guard roles={ROLES.SITE}><Procurement /></Guard>;
}

function Procurement() {
  const { t, short, n } = useT();
  const [tab, setTab] = useState<Tab>("orders");
  const orders = useList<PurchaseOrder>("/purchase-orders?page_size=200");
  const bills = useList<VendorBill>("/vendor-bills?page_size=200&status=POSTED");
  const vendors = useList<Vendor>("/vendors");

  const open = orders.rows.filter((o) => o.status === "DRAFT" || o.status === "APPROVED");
  const payable = bills.rows.reduce((a, b) => a + num(b.outstanding), 0);
  const retention = bills.rows.reduce((a, b) => a + num(b.retention_outstanding), 0);
  const dueSoon = bills.rows.filter((b) => num(b.outstanding) > 0 && b.due_date && (daysFromToday(b.due_date) ?? 99) <= 14);
  const overdue = dueSoon.filter((b) => (daysFromToday(b.due_date) ?? 0) < 0);

  return (
    <Page
      eyebrow={<><ShoppingCart className="size-3.5" />{t("Buying", "ক্রয়")}</>}
      title={t("Procurement & bills", "ক্রয় ও বিল")}
      subtitle={t("Order materials, record what vendors bill, hold retention and pay — every step lands in the ledger.", "মালামাল অর্ডার, বিল রেকর্ড, জামানত আটকে রাখা ও পরিশোধ — প্রতিটি ধাপ লেজারে যায়।")}
    >
      <motion.div variants={stagger} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<ClipboardList className="size-5" />} tone="sky" label={t("Open purchase orders", "চলমান পারচেজ অর্ডার")} value={open.reduce((a, o) => a + num(o.total), 0)} format={short} hint={t(`${open.length} awaiting approval or delivery`, `${n(open.length)}টি অনুমোদন/ডেলিভারির অপেক্ষায়`)} />
        <Stat icon={<ReceiptText className="size-5" />} tone="brick" label={t("Owed to vendors", "সরবরাহকারীর কাছে দেনা")} value={payable} format={short} hint={t(`${bills.rows.filter((b) => num(b.outstanding) > 0).length} unpaid bills`, `${n(bills.rows.filter((b) => num(b.outstanding) > 0).length)}টি অপরিশোধিত বিল`)} />
        <Stat icon={<ShieldHalf className="size-5" />} tone="brass" label={t("Retention held", "আটকে রাখা জামানত")} value={retention} format={short} hint={t("Paid when work is accepted", "কাজ বুঝে নিলে পরিশোধ")} />
        <Stat icon={<FileClock className="size-5" />} tone={overdue.length ? "rose" : "leaf"} danger={overdue.length > 0} label={t("Due within 14 days", "১৪ দিনের মধ্যে পরিশোধ")} value={dueSoon.reduce((a, b) => a + num(b.outstanding), 0)} format={short}
          hint={overdue.length ? t(`${overdue.length} already past due`, `${n(overdue.length)}টির মেয়াদ পেরিয়েছে`) : t("Nothing past due", "কোনোটির মেয়াদ পেরোয়নি")} />
      </motion.div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[
          { id: "orders", label: <span className="flex items-center gap-1.5"><ClipboardList className="size-4" />{t("Purchase orders", "পারচেজ অর্ডার")}</span>, count: orders.rows.filter((o) => o.status !== "CANCELLED").length },
          { id: "bills", label: <span className="flex items-center gap-1.5"><ReceiptText className="size-4" />{t("Bills", "বিল")}</span>, count: bills.rows.length },
          { id: "vendors", label: <span className="flex items-center gap-1.5"><Store className="size-4" />{t("Vendors", "সরবরাহকারী")}</span>, count: vendors.rows.length },
        ]} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease }} className="mt-5">
          {tab === "orders" && <Orders orders={orders.rows} loading={orders.loading} />}
          {tab === "bills" && <Bills />}
          {tab === "vendors" && <Vendors vendors={vendors.rows} loading={vendors.loading} />}
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}
