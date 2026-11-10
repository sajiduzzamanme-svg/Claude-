"use client";

import { MapPin, Pencil, Phone, Plus, Store } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useOnOpen } from "@/components/finance-parts";
import { StatusBadge } from "@/components/forms";
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Select, Skeleton, Textarea, cn, rise, stagger, useAction } from "@/components/ui";
import { api, refreshAll } from "@/lib/api";
import { ROLES, useAuth, type Role } from "@/lib/auth";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Vendor } from "@/lib/types";

const EDITORS: Role[] = [...ROLES.BUYING, "ENGINEER"];

export function Vendors({ vendors, loading }: { vendors: Vendor[]; loading: boolean }) {
  const { t, short, taka } = useT();
  const { can } = useAuth();
  const canEdit = can(EDITORS);
  const [editing, setEditing] = useState<Vendor | "new" | null>(null);
  const [kind, setKind] = useState("");
  const shown = vendors.filter((v) => !kind || v.kind === kind);
  const top = Math.max(...vendors.map((v) => num(v.billed)), 1);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-52">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{t("All kinds", "সব ধরন")}</option>
            <option value="SUPPLIER">{t("Material suppliers", "মালামাল সরবরাহকারী")}</option>
            <option value="CONTRACTOR">{t("Contractors", "ঠিকাদার")}</option>
            <option value="LABOUR">{t("Labour", "লেবার")}</option>
            <option value="CONSULTANT">{t("Consultants", "কনসালট্যান্ট")}</option>
          </Select>
        </div>
        {canEdit && <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>{t("Add vendor", "সরবরাহকারী যোগ করুন")}</Button>}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : shown.length === 0 ? (
        <Card><Empty icon={<Store />} title={t("No vendors here yet", "এখানে এখনো কোনো সরবরাহকারী নেই")} /></Card>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((v) => (
            <motion.div key={v.id} variants={rise} layout>
              <Card hover className={cn("flex h-full flex-col p-5", !v.is_active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <Avatar name={v.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-semibold">{v.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5"><StatusBadge group="vendor" value={v.kind} dot={false} />{!v.is_active && <Badge tone="neutral">{t("Inactive", "নিষ্ক্রিয়")}</Badge>}</div>
                  </div>
                  {canEdit && <button onClick={() => setEditing(v)} aria-label={t("Edit", "সম্পাদনা")} className="grid size-8 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-paper-deep hover:text-ink"><Pencil className="size-4" /></button>}
                </div>
                <div className="mt-3 space-y-1 text-[13px] text-mute">
                  {v.phone && <a href={`tel:${v.phone}`} className="flex items-center gap-2 hover:text-ink"><Phone className="size-3.5" /><span className="tnum">{v.phone}</span></a>}
                  {v.address && <div className="flex items-center gap-2"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{v.address}</span></div>}
                </div>
                <div className="mt-auto pt-4">
                  <div className="mb-1.5 flex items-baseline justify-between text-xs text-mute"><span>{t("Billed so far", "এ পর্যন্ত বিল")}</span><span className="tnum text-sm font-semibold text-ink" title={taka(v.billed)}>{short(v.billed)}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-paper-deep"><motion.div className="h-full rounded-full bg-ink" initial={{ width: 0 }} whileInView={{ width: `${(num(v.billed) / top) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} /></div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className={cn("rounded-xl px-3 py-2", num(v.payable) > 0 ? "bg-brick-wash" : "bg-paper-deep/70")}>
                      <div className="text-[11px] text-mute">{t("We owe", "আমাদের দেনা")}</div>
                      <div className={cn("tnum text-sm font-semibold", num(v.payable) > 0 && "text-brick-deep")}>{taka(v.payable)}</div>
                    </div>
                    <div className={cn("rounded-xl px-3 py-2", num(v.retention) > 0 ? "bg-brass-wash" : "bg-paper-deep/70")}>
                      <div className="text-[11px] text-mute">{t("Retention held", "জামানত আটকে")}</div>
                      <div className="tnum text-sm font-semibold">{taka(v.retention)}</div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
      <VendorModal target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function VendorModal({ target, onClose }: { target: Vendor | "new" | null; onClose: () => void }) {
  const { t } = useT();
  const { busy, error, run, setError } = useAction();
  const editing = target && target !== "new" ? target : null;
  const [f, setF] = useState({ name: "", kind: "SUPPLIER", phone: "", address: "", trade_license: "", notes: "", is_active: true });
  useOnOpen(target, (v) => {
    setError("");
    setF(v !== "new" ? { name: v.name, kind: v.kind, phone: v.phone, address: v.address, trade_license: v.trade_license, notes: v.notes, is_active: v.is_active }
      : { name: "", kind: "SUPPLIER", phone: "", address: "", trade_license: "", notes: "", is_active: true });
  });

  async function save() {
    const ok = await run(async () => {
      if (editing) await api.patch(`/vendors/${editing.id}`, f);
      else await api.post("/vendors", f);
      await refreshAll();
      return true;
    }, editing ? t("Vendor updated", "সরবরাহকারী আপডেট হয়েছে") : t("Vendor added", "সরবরাহকারী যোগ হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={!!target} onClose={onClose} title={editing ? t("Edit vendor", "সরবরাহকারী সম্পাদনা") : t("Add vendor", "সরবরাহকারী যোগ করুন")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button><Button loading={busy} disabled={!f.name.trim()} onClick={save}>{t("Save", "সেভ করুন")}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Name", "নাম")} required className="sm:col-span-2"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={t("Kind", "ধরন")}>
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Vendor["kind"] })}>
              <option value="SUPPLIER">{t("Material supplier", "মালামাল সরবরাহকারী")}</option>
              <option value="CONTRACTOR">{t("Contractor / builder", "ঠিকাদার / বিল্ডার")}</option>
              <option value="LABOUR">{t("Labour sardar", "লেবার সর্দার")}</option>
              <option value="CONSULTANT">{t("Consultant / architect", "কনসালট্যান্ট / আর্কিটেক্ট")}</option>
            </Select>
          </Field>
          <Field label={t("Phone", "ফোন")}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label={t("Address", "ঠিকানা")}><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label={t("Trade licence", "ট্রেড লাইসেন্স")}><Input value={f.trade_license} onChange={(e) => setF({ ...f, trade_license: e.target.value })} /></Field>
          <Field label={t("Notes", "নোট")} className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        {editing && (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" className="size-4 accent-brick" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
            {t("Active — can be chosen on new orders and bills", "সক্রিয় — নতুন অর্ডার ও বিলে বাছাই করা যাবে")}
          </label>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
