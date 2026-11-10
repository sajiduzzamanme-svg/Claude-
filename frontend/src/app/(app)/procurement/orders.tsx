"use client";

import { ArrowRight, Ban, Check, ClipboardList, PackageCheck, Plus, Truck } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Collapse, Chevron } from "@/components/finance-parts";
import { LineItems, ProjectSelect, emptyLine, lineTotal, linesPayload, type LineDraft } from "@/components/forms";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Select, Skeleton, cn, ease, useAction, useToast } from "@/components/ui";
import { api, errorText, refreshAll, useList } from "@/lib/api";
import { ROLES, useAuth, type Role } from "@/lib/auth";
import { num, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { PurchaseOrder, Vendor, WorkPackage } from "@/lib/types";

const ORDERERS: Role[] = [...ROLES.BUYING, "ENGINEER"];

export function Orders({ orders, loading }: { orders: PurchaseOrder[]; loading: boolean }) {
  const { t, short, n } = useT();
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);

  const stages = [
    { id: "DRAFT" as const, title: t("Draft", "খসড়া"), hint: t("Waiting for approval", "অনুমোদনের অপেক্ষায়"), icon: ClipboardList, tone: "bg-paper-deep text-ink-soft" },
    { id: "APPROVED" as const, title: t("Approved", "অনুমোদিত"), hint: t("Ordered — waiting for goods", "অর্ডার হয়েছে — মালের অপেক্ষায়"), icon: Truck, tone: "bg-brass text-ink" },
    { id: "RECEIVED" as const, title: t("Received & billed", "মাল গৃহীত ও বিল হয়েছে"), hint: t("Goods arrived, bill posted", "মাল এসেছে, বিল পোস্টেড"), icon: PackageCheck, tone: "bg-leaf text-white" },
  ];
  const cancelled = orders.filter((o) => o.status === "CANCELLED");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mute">{t("An order moves left to right. Receiving the goods turns it into a vendor bill automatically.", "অর্ডার বাঁ থেকে ডানে এগোয়। মাল গ্রহণ করলে নিজে থেকেই বিল তৈরি হয়।")}</p>
        {can(ORDERERS) && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>{t("New purchase order", "নতুন পারচেজ অর্ডার")}</Button>}
      </div>

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : (
        <LayoutGroup>
          <div className="grid items-start gap-4 lg:grid-cols-3">
            {stages.map((s, si) => {
              const items = orders.filter((o) => o.status === s.id);
              const Icon = s.icon;
              return (
                <section key={s.id} className="relative rounded-3xl border border-line bg-paper-deep/40 p-3">
                  {si < 2 && <ArrowRight className="absolute -right-[18px] top-7 z-10 hidden size-5 rounded-full border border-line bg-card p-0.5 text-mute lg:block" />}
                  <header className="mb-3 flex items-center gap-3 px-1">
                    <span className={cn("grid size-9 place-items-center rounded-xl", s.tone)}><Icon className="size-[18px]" /></span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold leading-tight">{s.title} <span className="tnum ml-1 rounded-full bg-line px-1.5 text-[11px] font-medium">{n(items.length)}</span></h3>
                      <p className="truncate text-xs text-mute">{s.hint}</p>
                    </div>
                    <span className="tnum text-sm font-semibold">{short(items.reduce((a, o) => a + num(o.total), 0))}</span>
                  </header>
                  <div className="space-y-2.5">
                    <AnimatePresence mode="popLayout">
                      {items.slice(0, s.id === "RECEIVED" ? 8 : 50).map((o) => <OrderCard key={o.id} o={o} onReceive={() => setReceiving(o)} />)}
                    </AnimatePresence>
                    {items.length === 0 && <div className="hatch rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-mute">{t("Empty", "ফাঁকা")}</div>}
                    {s.id === "RECEIVED" && items.length > 8 && <p className="px-1 pt-1 text-center text-xs text-mute">{t(`Showing the latest 8 of ${items.length}. Older ones are under Bills.`, `${n(items.length)}টির মধ্যে সাম্প্রতিক ৮টি। বাকিগুলো বিল ট্যাবে।`)}</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </LayoutGroup>
      )}

      {!loading && orders.length === 0 && <Card className="mt-4"><Empty icon={<ClipboardList />} title={t("No purchase orders yet", "এখনো কোনো পারচেজ অর্ডার নেই")} /></Card>}

      {cancelled.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowCancelled((s) => !s)} className="flex items-center gap-2 text-sm text-mute hover:text-ink">
            <Ban className="size-4" />{t(`${cancelled.length} cancelled orders`, `${n(cancelled.length)}টি বাতিল অর্ডার`)}<Chevron open={showCancelled} />
          </button>
          <Collapse open={showCancelled}>
            <ul className="mt-2 divide-y divide-line/70 rounded-2xl border border-line bg-card text-sm">
              {cancelled.map((o) => <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-mute"><span className="tnum">{o.number}</span><span className="min-w-0 flex-1 truncate">{o.vendor_name} · {o.project_code}</span><span className="tnum line-through">{short(o.total)}</span></li>)}
            </ul>
          </Collapse>
        </div>
      )}

      <OrderModal open={creating} onClose={() => setCreating(false)} />
      <ReceiveGoodsModal order={receiving} onClose={() => setReceiving(null)} />
    </div>
  );
}

function OrderCard({ o, onReceive }: { o: PurchaseOrder; onReceive: () => void }) {
  const { t, taka, date, n } = useT();
  const { can } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState(false);

  async function act(action: "approve" | "cancel") {
    setBusy(action);
    try {
      await api.post(`/purchase-orders/${o.id}/${action}`);
      await refreshAll();
      toast.ok(action === "approve" ? t(`${o.number} approved`, `${o.number} অনুমোদিত`) : t(`${o.number} cancelled`, `${o.number} বাতিল`));
    } catch (e) {
      toast.err(errorText(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <motion.div layout layoutId={`po-${o.id}`} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.35, ease }}>
      <Card hover className="p-4">
        <button type="button" onClick={() => setOpen((s) => !s)} className="flex w-full items-start justify-between gap-3 text-left">
          <div className="min-w-0">
            <div className="tnum text-[11px] font-semibold uppercase tracking-[0.12em] text-brick">{o.number}</div>
            <div className="truncate text-[15px] font-semibold">{o.vendor_name}</div>
            <div className="truncate text-xs text-mute">{o.project_code}{o.work_package_name ? ` · ${o.work_package_name}` : ""} · {date(o.date)}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tnum text-[15px] font-bold">{taka(o.total)}</div>
            <div className="mt-1 flex items-center justify-end gap-1 text-xs text-mute">{n(o.lines.length)} {o.lines.length === 1 ? t("item", "আইটেম") : t("items", "আইটেম")}<Chevron open={open} /></div>
          </div>
        </button>
        <Collapse open={open}>
          <ul className="mt-3 divide-y divide-line/70 rounded-xl bg-paper-deep/50 px-3 text-[13px]">
            {o.lines.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{l.item}<span className="ml-2 text-xs text-mute">{l.cost_head_name}</span></span>
                <span className="tnum whitespace-nowrap text-mute">{n(l.quantity, num(l.quantity) % 1 ? 2 : 0)} {l.unit} × {taka(l.rate)}</span>
                <span className="tnum whitespace-nowrap font-medium">{taka(l.amount)}</span>
              </li>
            ))}
          </ul>
          {o.notes && <p className="mt-2 text-xs text-mute">{o.notes}</p>}
        </Collapse>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {o.status === "DRAFT" && can(ROLES.MANAGERS) && <Button size="sm" variant="dark" loading={busy === "approve"} icon={<Check className="size-4" />} onClick={() => act("approve")}>{t("Approve", "অনুমোদন")}</Button>}
          {o.status === "DRAFT" && !can(ROLES.MANAGERS) && <Badge tone="neutral">{t("Needs owner approval", "মালিকের অনুমোদন লাগবে")}</Badge>}
          {o.status === "APPROVED" && can(ROLES.BUYING) && <Button size="sm" icon={<PackageCheck className="size-4" />} onClick={onReceive}>{t("Receive goods", "মাল গ্রহণ")}</Button>}
          {o.status === "APPROVED" && !can(ROLES.BUYING) && <Badge tone="brass" dot>{t("Waiting for delivery", "ডেলিভারির অপেক্ষায়")}</Badge>}
          {(o.status === "DRAFT" || o.status === "APPROVED") && can(ORDERERS) && <Button size="sm" variant="ghost" loading={busy === "cancel"} onClick={() => act("cancel")}>{t("Cancel order", "অর্ডার বাতিল")}</Button>}
          {o.status === "RECEIVED" && <Badge tone="leaf" dot>{t("Bill", "বিল")} {o.bill_number}</Badge>}
          {o.expected_date && o.status !== "RECEIVED" && <span className="ml-auto text-xs text-mute">{t("Expected", "প্রত্যাশিত")} {date(o.expected_date)}</span>}
        </div>
      </Card>
    </motion.div>
  );
}

function OrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const { rows: vendors } = useList<Vendor>("/vendors");
  const [f, setF] = useState({ project: "", vendor: "", work_package: "", date: today(), expected_date: "", notes: "" });
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const { rows: packages } = useList<WorkPackage>(open && f.project ? `/work-packages?project=${f.project}` : null);

  useEffect(() => {
    if (open) { setF({ project: "", vendor: "", work_package: "", date: today(), expected_date: "", notes: "" }); setLines([emptyLine()]); setError(""); }
  }, [open, setError]);

  // A purchase order is always quantity × rate, so every line needs both.
  const complete = lines.filter((l) => l.cost_head && l.description.trim() && num(l.quantity) > 0 && num(l.rate) > 0);
  const partial = lines.some((l) => (l.cost_head || l.description || l.rate) && !(l.cost_head && l.description.trim() && num(l.quantity) > 0 && num(l.rate) > 0));
  const valid = f.project && f.vendor && f.date && complete.length > 0 && !partial;

  async function save() {
    const ok = await run(async () => {
      await api.post("/purchase-orders", {
        project: Number(f.project), vendor: Number(f.vendor), work_package: f.work_package ? Number(f.work_package) : null,
        date: f.date, expected_date: f.expected_date || null, notes: f.notes, lines: linesPayload(complete, "item"),
      });
      await refreshAll();
      return true;
    }, t("Purchase order created", "পারচেজ অর্ডার তৈরি হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title={t("New purchase order", "নতুন পারচেজ অর্ডার")}
      subtitle={t("Saved as a draft. Nothing is posted to the books until the goods are received.", "খসড়া হিসেবে সেভ হবে। মাল গ্রহণের আগে হিসাবে কিছু পোস্ট হয় না।")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button><Button loading={busy} disabled={!valid} onClick={save}>{t("Create order", "অর্ডার তৈরি করুন")}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("Project", "প্রজেক্ট")} required><ProjectSelect value={f.project} onChange={(v) => setF({ ...f, project: v, work_package: "" })} /></Field>
          <Field label={t("Vendor", "সরবরাহকারী")} required>
            <Select value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })}>
              <option value="">{t("Choose vendor", "সরবরাহকারী বাছুন")}</option>
              {vendors.filter((v) => v.is_active).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <Field label={t("Work package", "কাজের অংশ")} hint={t("Optional", "ঐচ্ছিক")}>
            <Select value={f.work_package} disabled={!f.project} onChange={(e) => setF({ ...f, work_package: e.target.value })}>
              <option value="">{t("Not linked", "যুক্ত নয়")}</option>
              {packages.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </Field>
          <Field label={t("Order date", "অর্ডারের তারিখ")} required><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={t("Expected delivery", "প্রত্যাশিত ডেলিভারি")}><Input type="date" value={f.expected_date} min={f.date} onChange={(e) => setF({ ...f, expected_date: e.target.value })} /></Field>
          <Field label={t("Notes", "নোট")}><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        <LineItems lines={lines} onChange={setLines} itemLabel={t("Item", "মালামাল")} />
        {partial && <p className="text-xs text-rose">{t("Each item needs a cost head, a name, a quantity and a rate.", "প্রতিটি আইটেমে খরচের খাত, নাম, পরিমাণ ও দর লাগবে।")}</p>}
        <p className="text-xs text-mute">{t("Order total", "অর্ডারের মোট")}: <b className="tnum text-ink">{taka(complete.reduce((a, l) => a + lineTotal(l), 0))}</b></p>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function ReceiveGoodsModal({ order, onClose }: { order: PurchaseOrder | null; onClose: () => void }) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const [f, setF] = useState({ date: today(), reference: "", due_date: "" });
  useEffect(() => { if (order) { setF({ date: today(), reference: "", due_date: "" }); setError(""); } }, [order, setError]);

  async function save() {
    if (!order) return;
    const ok = await run(async () => {
      await api.post(`/purchase-orders/${order.id}/receive`, { date: f.date, reference: f.reference, due_date: f.due_date || null });
      await refreshAll();
      return true;
    }, t("Goods received — bill posted", "মাল গৃহীত — বিল পোস্ট হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={!!order} onClose={onClose} title={t("Receive goods", "মাল গ্রহণ")} subtitle={order && `${order.number} · ${order.vendor_name}`}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button><Button loading={busy} disabled={!f.date} icon={<PackageCheck className="size-4" />} onClick={save}>{t("Confirm receipt", "গ্রহণ নিশ্চিত করুন")}</Button></>}>
      {order && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-paper-deep/70 p-4 text-sm">
            {t("A vendor bill of", "এই অঙ্কের একটি বিল তৈরি হবে:")} <b className="tnum text-base">{taka(order.total)}</b> {t("will be posted: the cost goes to the project and the amount becomes payable to the vendor.", "— খরচ প্রজেক্টে যাবে এবং টাকা সরবরাহকারীর দেনা হবে।")}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("Received on", "গ্রহণের তারিখ")} required><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label={t("Challan / invoice no.", "চালান / ইনভয়েস নং")}><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
            <Field label={t("Payment due", "পরিশোধের শেষ তারিখ")}><Input type="date" value={f.due_date} min={f.date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          </div>
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Modal>
  );
}
