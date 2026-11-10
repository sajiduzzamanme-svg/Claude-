"use client";

import { ArrowUpRight, Briefcase, IdCard, Mail, MapPin, Pencil, Phone, Plus, Search, UserPlus, Users } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/forms";
import { CustomerModal, PaidBar, useDebounced } from "@/components/sales-parts";
import { Guard, Page } from "@/components/shell";
import { Avatar, Badge, Button, Card, CountUp, Empty, Input, KeyValue, Modal, Skeleton, cn, ease, rise } from "@/components/ui";
import { qs, useList } from "@/lib/api";
import { ROLES } from "@/lib/auth";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Booking, Customer } from "@/lib/types";

type Filter = "all" | "owners" | "balance" | "prospects";

export default function CustomersPage() {
  return <Guard roles={ROLES.SALES_TEAM}><Customers /></Guard>;
}

function Customers() {
  const { t, short, n, pct } = useT();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const q = useDebounced(search.trim(), 250);
  const { rows, loading, error } = useList<Customer>(`/customers${qs({ search: q, page_size: 200 })}`);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);

  const totals = useMemo(() => {
    const contract = rows.reduce((a, c) => a + num(c.contract_value), 0);
    const paid = rows.reduce((a, c) => a + num(c.paid), 0);
    return { contract, paid, owners: rows.filter((c) => c.bookings_count > 0).length };
  }, [rows]);

  const shown = rows.filter((c) =>
    filter === "owners" ? c.bookings_count > 0
    : filter === "balance" ? num(c.contract_value) - num(c.paid) > 0
    : filter === "prospects" ? c.bookings_count === 0
    : true,
  );
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: t("Everyone", "সবাই"), count: rows.length },
    { id: "owners", label: t("Flat owners", "ফ্ল্যাট মালিক"), count: totals.owners },
    { id: "balance", label: t("With a balance", "বাকি আছে"), count: rows.filter((c) => num(c.contract_value) - num(c.paid) > 0).length },
    { id: "prospects", label: t("No booking yet", "বুকিং হয়নি"), count: rows.length - totals.owners },
  ];

  return (
    <Page
      eyebrow={t("People", "মানুষ")}
      title={t("Customers", "ক্রেতা")}
      subtitle={t("Everyone who has bought, or is about to buy, a flat — with what they owe at a glance.", "যাঁরা ফ্ল্যাট কিনেছেন বা কিনতে যাচ্ছেন — কার কত বাকি, এক নজরে।")}
      actions={<Button icon={<UserPlus className="size-4" />} onClick={() => setEditing("new")}>{t("New customer", "নতুন ক্রেতা")}</Button>}
    >
      {/* ---------- directory header ---------- */}
      <motion.div variants={rise}>
        <Card className="relative overflow-hidden p-5 sm:p-6">
          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <div>
              <div className="relative max-w-xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-mute" />
                <Input autoFocus className="h-14 rounded-2xl pl-12 text-base shadow-card" placeholder={t("Search by name, phone, NID or email", "নাম, ফোন, এনআইডি বা ইমেইল দিয়ে খুঁজুন")} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {filters.map((f) => (
                  <button key={f.id} onClick={() => setFilter(f.id)} className={cn("relative rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", filter === f.id ? "text-paper" : "border border-line bg-card text-ink-soft hover:border-ink")}>
                    {filter === f.id && <motion.span layoutId="cust-filter" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                    <span className="relative z-10">{f.label} <span className="tnum opacity-70">{n(f.count)}</span></span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-end">
                <div className="flex -space-x-2.5">
                  {rows.slice(0, 9).map((c, i) => (
                    <motion.span key={c.id} title={c.name} className="rounded-full ring-2 ring-card" initial={{ opacity: 0, x: 16, scale: 0.6 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 26, delay: 0.15 + 0.05 * i }}>
                      <Avatar name={c.name} size={34} />
                    </motion.span>
                  ))}
                </div>
                {rows.length > 9 && <span className="tnum ml-2 text-sm font-medium text-mute">+{n(rows.length - 9)}</span>}
              </div>
              <div className="grid grid-cols-3 gap-3">
              <Stat label={t("Customers", "ক্রেতা")} value={rows.length} format={(v) => n(Math.round(v))} />
              <Stat label={t("Contracts", "চুক্তিমূল্য")} value={totals.contract} format={short} />
              <Stat label={t("Paid so far", "এ পর্যন্ত আদায়")} value={totals.paid} format={short} sub={totals.contract ? pct((totals.paid / totals.contract) * 100) : undefined} />
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ---------- cards ---------- */}
      {error ? <Card className="mt-5"><Empty title={error.message} /></Card>
        : loading && rows.length === 0 ? <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-44" />)}</div>
        : shown.length === 0 ? (
          <Card className="mt-5">
            <Empty icon={<Users />} title={q ? t(`No one matches “${q}”`, `“${q}” এর সাথে কেউ মিলছে না`) : t("No customers here yet", "এখানে এখনো কোনো ক্রেতা নেই")}
              hint={t("Add a customer, or convert a lead from the pipeline.", "নতুন ক্রেতা যোগ করুন, অথবা পাইপলাইন থেকে লিড রূপান্তর করুন।")}
              action={<Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>{t("New customer", "নতুন ক্রেতা")}</Button>} />
          </Card>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((c, i) => <CustomerCard key={c.id} c={c} index={i} onOpen={() => setViewing(c)} />)}
          </div>
        )}

      <CustomerDetail customer={viewing} onClose={() => setViewing(null)} onEdit={(c) => { setViewing(null); setEditing(c); }} />
      <CustomerModal open={!!editing} customer={editing && editing !== "new" ? editing : null} onClose={() => setEditing(null)} />
    </Page>
  );
}

function Stat({ label, value, format, sub }: { label: string; value: number; format: (v: number) => string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper/70 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{label}</div>
      <CountUp value={value} format={format} className="mt-1 block text-xl font-bold tracking-tight" />
      {sub && <div className="tnum text-xs text-leaf">{sub}</div>}
    </div>
  );
}

function CustomerCard({ c, index, onOpen }: { c: Customer; index: number; onOpen: () => void }) {
  const { t, short, n, pct } = useT();
  const contract = num(c.contract_value), paid = num(c.paid);
  const share = contract ? (paid / contract) * 100 : 0;
  return (
    <motion.button type="button" onClick={onOpen} layout
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease, delay: Math.min(index * 0.035, 0.5) }}
      className="group relative overflow-hidden rounded-2xl border border-line bg-card p-5 text-left shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift">
      <span className="hatch pointer-events-none absolute inset-x-0 top-0 h-12 opacity-60" />
      <div className="relative flex items-start gap-3.5">
        <motion.span whileHover={{ rotate: -6, scale: 1.06 }} className="shrink-0 rounded-full ring-4 ring-card"><Avatar name={c.name} size={52} /></motion.span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight">{c.name}</h3>
          <p className="tnum mt-0.5 flex items-center gap-1.5 text-[13px] text-mute"><Phone className="size-3" />{c.phone}</p>
        </div>
        {c.bookings_count > 0
          ? <Badge tone="brass">{n(c.bookings_count)} {c.bookings_count === 1 ? t("flat", "ফ্ল্যাট") : t("flats", "ফ্ল্যাট")}</Badge>
          : <Badge tone="neutral">{t("Prospect", "সম্ভাব্য")}</Badge>}
      </div>
      {contract > 0 ? (
        <div className="relative mt-5">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-mute">{t("Paid", "পরিশোধ")} <b className="tnum ml-1 font-semibold text-ink">{short(paid)}</b></span>
            <span className="text-mute">{t("of", "মোট")} <b className="tnum font-semibold text-ink">{short(contract)}</b></span>
          </div>
          <PaidBar paid={paid} total={contract} delay={Math.min(index * 0.035, 0.5) + 0.2} />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="tnum font-medium text-leaf">{pct(share)}</span>
            <span className="text-mute">{t("Balance", "বাকি")} <b className="tnum font-semibold text-brick">{short(contract - paid)}</b></span>
          </div>
        </div>
      ) : (
        <p className="relative mt-5 rounded-xl border border-dashed border-line px-3 py-3 text-[13px] text-mute">{c.address || t("No booking yet — open to start one.", "এখনো বুকিং নেই — খুলে শুরু করুন।")}</p>
      )}
      <ArrowUpRight className="absolute bottom-4 right-4 size-4 text-mute opacity-0 transition group-hover:opacity-100" />
    </motion.button>
  );
}

function CustomerDetail({ customer, onClose, onEdit }: { customer: Customer | null; onClose: () => void; onEdit: (c: Customer) => void }) {
  const { t, taka, short, date } = useT();
  const { rows: bookings, loading } = useList<Booking>(customer ? `/bookings?customer=${customer.id}&page_size=50` : null);
  const c = customer;
  return (
    <Modal open={!!c} onClose={onClose} size="lg" title={c?.name ?? ""} subtitle={c && <span className="tnum">{c.phone}</span>}
      footer={c && <>
        <a href={`tel:${c.phone}`} className="mr-auto"><Button variant="outline" icon={<Phone className="size-4" />}>{t("Call", "ফোন করুন")}</Button></a>
        <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={() => onEdit(c)}>{t("Edit", "সম্পাদনা")}</Button>
        <Link href={`/bookings/new?customer=${c.id}`}><Button icon={<Plus className="size-4" />}>{t("New booking", "নতুন বুকিং")}</Button></Link>
      </>}>
      {c && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar name={c.name} size={64} />
            <div className="grid flex-1 grid-cols-3 gap-3">
              <Mini label={t("Contracts", "চুক্তিমূল্য")} value={short(c.contract_value)} />
              <Mini label={t("Paid", "পরিশোধ")} value={short(c.paid)} tone="text-leaf" />
              <Mini label={t("Balance", "বাকি")} value={short(num(c.contract_value) - num(c.paid))} tone="text-brick" />
            </div>
          </div>
          <div className="grid gap-x-8 sm:grid-cols-2">
            <div className="divide-y divide-line/60">
              <KeyValue label={<span className="flex items-center gap-1.5"><IdCard className="size-3.5" />{t("National ID", "এনআইডি")}</span>}>{c.nid || "—"}</KeyValue>
              <KeyValue label={t("Father's name", "পিতার নাম")}>{c.father_name || "—"}</KeyValue>
              <KeyValue label={<span className="flex items-center gap-1.5"><Briefcase className="size-3.5" />{t("Occupation", "পেশা")}</span>}>{c.occupation || "—"}</KeyValue>
              <KeyValue label={<span className="flex items-center gap-1.5"><Mail className="size-3.5" />{t("Email", "ইমেইল")}</span>}>{c.email || "—"}</KeyValue>
            </div>
            <div className="divide-y divide-line/60">
              <KeyValue label={<span className="flex items-center gap-1.5"><MapPin className="size-3.5" />{t("Address", "ঠিকানা")}</span>}>{c.address || "—"}</KeyValue>
              <KeyValue label={t("Nominee", "নমিনি")}>{c.nominee_name || "—"}</KeyValue>
              <KeyValue label={t("Relation", "সম্পর্ক")}>{c.nominee_relation || "—"}</KeyValue>
              <KeyValue label={t("Customer since", "যুক্ত হয়েছেন")}>{date(c.created_at)}</KeyValue>
            </div>
          </div>
          {c.notes && <p className="rounded-xl bg-paper-deep/70 px-4 py-3 text-sm text-ink-soft">{c.notes}</p>}
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-mute">{t("Bookings", "বুকিং")}</h4>
            {loading ? <Skeleton className="h-16" /> : bookings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-mute">{t("No bookings yet.", "এখনো কোনো বুকিং নেই।")}</p>
            ) : (
              <ul className="space-y-2">
                {bookings.map((b, i) => (
                  <motion.li key={b.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.06 * i }}>
                    <Link href={`/bookings/${b.id}`} className="block rounded-xl border border-line p-3.5 transition hover:border-ink hover:shadow-card">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="rounded-lg bg-ink px-2 py-1 text-xs font-semibold text-paper">{b.project_code} · {b.flat_code}</span>
                          <span className="tnum text-xs text-mute">{b.number} · {date(b.booking_date)}</span>
                        </div>
                        <StatusBadge group="booking" value={b.status} />
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <PaidBar paid={num(b.paid)} overdue={num(b.overdue)} total={num(b.contract_value)} className="flex-1" />
                        <span className="tnum whitespace-nowrap text-xs text-ink-soft">{taka(b.paid)} / {taka(b.contract_value)}</span>
                      </div>
                      {num(b.overdue) > 0 && <p className="tnum mt-1.5 text-xs font-medium text-rose">{t("Overdue", "বকেয়া")} {taka(b.overdue)}</p>}
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-paper-deep/70 px-3 py-2">
      <div className="text-[11px] text-mute">{label}</div>
      <div className={cn("tnum text-base font-semibold", tone)}>{value}</div>
    </div>
  );
}
