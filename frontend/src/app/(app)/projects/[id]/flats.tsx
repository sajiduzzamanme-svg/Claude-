"use client";

import { ArrowUpRight, Building2, Grid2x2Plus, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FlatGrid, StatusLegend, type FlatStatus, type GridFlat } from "@/components/building";
import { StatusBadge, useLabel } from "@/components/forms";
import { Block, Figure, Panel, useOnChange, useOnOpen } from "@/components/project-parts";
import { Button, Card, Empty, ErrorNote, Field, Input, KeyValue, Modal, MoneyInput, Skeleton, cn, useAction } from "@/components/ui";
import { api, refreshAll } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Flat, Project } from "@/lib/types";

const STATUSES: FlatStatus[] = ["AVAILABLE", "HOLD", "BOOKED", "HANDED_OVER"];

export function FlatsTab({ project, flats, loading }: { project: Project; flats: Flat[]; loading: boolean }) {
  const { t, short, n } = useT();
  const { can } = useAuth();
  const label = useLabel();
  const manager = can(ROLES.MANAGERS);
  const [openId, setOpenId] = useState<number | null>(null);
  const [generate, setGenerate] = useState(false);
  const open = flats.find((f) => f.id === openId) ?? null;

  const stats = useMemo(() => {
    const sqft = flats.reduce((a, f) => a + num(f.size_sqft), 0);
    const value = flats.reduce((a, f) => a + num(f.list_price), 0);
    const unsold = flats.filter((f) => f.status === "AVAILABLE" || f.status === "HOLD");
    return { sqft, value, perSqft: sqft ? value / sqft : 0, unsoldValue: unsold.reduce((a, f) => a + num(f.list_price), 0), unsold: unsold.length };
  }, [flats]);

  const meta = (f: GridFlat) =>
    f.status === "BOOKED" || f.status === "HANDED_OVER" ? (f.booking?.customer ?? label("flat", f.status))
    : f.status === "HOLD" ? label("flat", "HOLD") : short(f.list_price);

  return (
    <Panel className="space-y-5">
      <Block className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <Figure label={t("Total floor area", "মোট আয়তন")}>{n(stats.sqft)} <span className="text-sm font-normal text-mute">{t("sft", "বর্গফুট")}</span></Figure>
          <Figure label={t("Value at list price", "তালিকামূল্যে মোট মূল্য")}>{short(stats.value)}</Figure>
          <Figure label={t("Average per sft", "গড় বর্গফুট দর")}>{short(stats.perSqft)}</Figure>
          <Figure label={t(`Unsold (${stats.unsold})`, `অবিক্রিত (${n(stats.unsold)})`)}>{short(stats.unsoldValue)}</Figure>
        </div>
        {manager && <Button icon={<Grid2x2Plus className="size-4" />} onClick={() => setGenerate(true)}>{t("Generate flats", "ফ্ল্যাট তৈরি করুন")}</Button>}
      </Block>

      <Block>
        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">{t("Stacking plan", "স্ট্যাকিং প্ল্যান")}</h2>
              <p className="mt-0.5 text-[13px] text-mute">{t("Top floor first. Click a flat to see its price and buyer.", "ওপরের তলা আগে। দাম ও ক্রেতা দেখতে ফ্ল্যাটে ক্লিক করুন।")}</p>
            </div>
            <StatusLegend items={STATUSES.map((s) => ({ status: s, label: label("flat", s), count: flats.filter((f) => f.status === s).length }))} />
          </div>
          {loading && !flats.length ? (
            <Skeleton className="h-80" />
          ) : flats.length === 0 ? (
            <Empty icon={<Building2 />} title={t("No flats yet", "এখনো কোনো ফ্ল্যাট নেই")}
              hint={t("Generate the whole building in one step: floors × unit letters.", "এক ধাপে পুরো ভবন তৈরি করুন: তলা × ইউনিট।")}
              action={manager && <Button icon={<Grid2x2Plus className="size-4" />} onClick={() => setGenerate(true)}>{t("Generate flats", "ফ্ল্যাট তৈরি করুন")}</Button>} />
          ) : (
            <FlatGrid flats={flats} selected={openId} onSelect={(f) => setOpenId(f.id)} renderMeta={meta} />
          )}
        </Card>
      </Block>

      <FlatModal flat={open} onClose={() => setOpenId(null)} manager={manager} />
      <GenerateModal open={generate} onClose={() => setGenerate(false)} project={project} existing={flats} />
    </Panel>
  );
}

/* ---------- one flat: prices, buyer, edit ---------- */
function FlatModal({ flat: current, onClose, manager }: { flat: Flat | null; onClose: () => void; manager: boolean }) {
  // Keep showing the last flat while the dialog animates out.
  const [flat, setFlat] = useState<Flat | null>(current);
  if (current && current !== flat) setFlat(current);
  const { t, taka, n } = useT();
  const { can } = useAuth();
  const { busy, error, run, setError } = useAction();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ land_price: "", construction_price: "", other_charges: "", size_sqft: "", flat_type: "", facing: "", bedrooms: "" });
  useOnChange(current?.id, () => {
    if (!current) return;
    const flat = current;
    setEdit(false);
    setError("");
    setF({
      land_price: String(num(flat.land_price)), construction_price: String(num(flat.construction_price)), other_charges: String(num(flat.other_charges)),
      size_sqft: String(num(flat.size_sqft)), flat_type: flat.flat_type, facing: flat.facing, bedrooms: String(flat.bedrooms || ""),
    });
  });

  if (!flat) return null;
  const sold = flat.status === "BOOKED" || flat.status === "HANDED_OVER";
  const list = num(f.land_price) + num(f.construction_price) + num(f.other_charges);
  const perSqft = num(flat.size_sqft) ? num(flat.list_price) / num(flat.size_sqft) : 0;

  const save = () => run(async () => {
    await api.patch(`/flats/${flat.id}`, {
      land_price: f.land_price || "0", construction_price: f.construction_price || "0", other_charges: f.other_charges || "0",
      size_sqft: f.size_sqft, flat_type: f.flat_type, facing: f.facing, bedrooms: Number(f.bedrooms) || 0,
    });
    await refreshAll();
    setEdit(false);
  }, t("Flat updated", "ফ্ল্যাট আপডেট হয়েছে"));
  const toggleHold = () => run(async () => {
    await api.patch(`/flats/${flat.id}`, { status: flat.status === "HOLD" ? "AVAILABLE" : "HOLD" });
    await refreshAll();
  }, flat.status === "HOLD" ? t("Released for sale", "বিক্রির জন্য ছাড়া হয়েছে") : t("Put on hold", "হোল্ডে রাখা হয়েছে"));
  const remove = async () => {
    const ok = await run(async () => { await api.del(`/flats/${flat.id}`); await refreshAll(); return true; }, t("Flat deleted", "ফ্ল্যাট মুছে ফেলা হয়েছে"));
    if (ok) onClose();
  };

  return (
    <Modal open={!!current} onClose={onClose} title={<span className="flex items-center gap-3">{t("Flat", "ফ্ল্যাট")} {flat.code}<StatusBadge group="flat" value={flat.status} /></span>}
      subtitle={`${flat.project_code} · ${t("Floor", "তলা")} ${n(flat.floor)} · ${n(flat.size_sqft)} ${t("sft", "বর্গফুট")}${flat.flat_type ? ` · ${flat.flat_type}` : ""}${flat.facing ? ` · ${flat.facing}` : ""}`}
      footer={edit ? <>
        <Button variant="ghost" onClick={() => setEdit(false)}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!num(f.size_sqft)} onClick={save}>{t("Save prices", "দাম সেভ করুন")}</Button>
      </> : <>
        {manager && !sold && <Button variant="ghost" className="mr-auto text-rose hover:bg-rose-wash" icon={<Trash2 className="size-4" />} loading={busy} onClick={remove}>{t("Delete", "মুছুন")}</Button>}
        {manager && !sold && <Button variant="outline" loading={busy} onClick={toggleHold}>{flat.status === "HOLD" ? t("Release for sale", "বিক্রির জন্য ছাড়ুন") : t("Put on hold", "হোল্ডে রাখুন")}</Button>}
        {manager && <Button variant="dark" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>{t("Edit prices", "দাম সম্পাদনা")}</Button>}
      </>}>
      <div className="space-y-4">
        {edit ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("Land part", "জমির অংশ")}><MoneyInput value={f.land_price} onChange={(v) => setF({ ...f, land_price: v })} /></Field>
              <Field label={t("Construction part", "নির্মাণের অংশ")}><MoneyInput value={f.construction_price} onChange={(v) => setF({ ...f, construction_price: v })} /></Field>
              <Field label={t("Parking & utility", "পার্কিং ও ইউটিলিটি")}><MoneyInput value={f.other_charges} onChange={(v) => setF({ ...f, other_charges: v })} /></Field>
              <Field label={t("Size (sft)", "আয়তন (বর্গফুট)")}><Input className="tnum" inputMode="decimal" value={f.size_sqft} onChange={(e) => setF({ ...f, size_sqft: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
              <Field label={t("Type", "ধরন")}><Input value={f.flat_type} onChange={(e) => setF({ ...f, flat_type: e.target.value })} /></Field>
              <Field label={t("Facing", "মুখ")}><Input value={f.facing} onChange={(e) => setF({ ...f, facing: e.target.value })} /></Field>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-ink px-5 py-3.5 text-paper">
              <span className="text-sm text-paper/70">{t("New list price", "নতুন তালিকামূল্য")}</span>
              <span className="tnum text-2xl font-bold">{taka(list)}</span>
            </div>
            {sold && <p className="rounded-xl bg-brass-wash px-3.5 py-2.5 text-sm text-[#8a6410]">{t("This flat is already sold. Changing the list price here does not change the buyer's contract.", "এই ফ্ল্যাটটি বিক্রি হয়ে গেছে। এখানে তালিকামূল্য বদলালে ক্রেতার চুক্তি বদলায় না।")}</p>}
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-line p-4">
              <KeyValue label={t("Land part", "জমির অংশ")}>{taka(flat.land_price)}</KeyValue>
              <KeyValue label={t("Construction part", "নির্মাণের অংশ")}>{taka(flat.construction_price)}</KeyValue>
              <KeyValue label={t("Parking & utility", "পার্কিং ও ইউটিলিটি")}>{taka(flat.other_charges)}</KeyValue>
              <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-sm font-medium">{t("List price", "তালিকামূল্য")}</span>
                <span className="tnum text-2xl font-bold">{taka(flat.list_price)}</span>
              </div>
              <div className="mt-1 text-right text-xs text-mute">{taka(perSqft)} / {t("sft", "বর্গফুট")} · {t("land share", "জমির ভাগ")} {n(flat.land_share_katha, 4)} {t("katha", "কাঠা")}</div>
            </div>
            {flat.booking ? (
              <div className={cn("flex items-center justify-between gap-3 rounded-2xl px-4 py-3", flat.status === "HANDED_OVER" ? "bg-leaf-wash" : "bg-brass-wash")}>
                <div className="min-w-0">
                  <div className="text-xs text-ink-soft">{t("Sold to", "ক্রেতা")}</div>
                  <div className="truncate font-semibold">{flat.booking.customer}</div>
                  <div className="tnum text-xs text-ink-soft">{flat.booking.number}</div>
                </div>
                {can(ROLES.SALES_TEAM) && (
                  <Link href={`/bookings/${flat.booking.id}`}><Button size="sm" variant="dark" icon={<ArrowUpRight className="order-last size-4" />}>{t("Open booking", "বুকিং দেখুন")}</Button></Link>
                )}
              </div>
            ) : flat.status === "AVAILABLE" && can(ROLES.SALES_TEAM) ? (
              <Link href="/bookings/new" className="block"><Button className="w-full" icon={<ArrowUpRight className="order-last size-4" />}>{t("Book this flat", "এই ফ্ল্যাট বুক করুন")}</Button></Link>
            ) : null}
          </>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

/* ---------- build the whole grid at once ---------- */
function GenerateModal({ open, onClose, project, existing }: { open: boolean; onClose: () => void; project: Project; existing: Flat[] }) {
  const { t, taka, n } = useT();
  const { busy, error, run, setError } = useAction();
  const blank = { floors_from: "1", floors_to: String(Math.max(project.storeys - 1, 1)), units: "A, B", size_sqft: "", flat_type: "3 Bed", bedrooms: "3", facing: "", land_share_katha: "", land_price: "", construction_price: "", other_charges: "" };
  const [f, setF] = useState(blank);
  useOnOpen(open, () => { setF(blank); setError(""); });

  const units = f.units.split(/[\s,]+/).map((u) => u.trim().toUpperCase()).filter(Boolean);
  const from = Number(f.floors_from) || 0, to = Number(f.floors_to) || 0;
  const count = to >= from ? (to - from + 1) * units.length : 0;
  const taken = new Set(existing.map((x) => x.code));
  const clash: string[] = [];
  for (let fl = from; fl <= to && clash.length < 4; fl++) for (const u of units) if (taken.has(`${fl}${u}`)) clash.push(`${fl}${u}`);
  const list = num(f.land_price) + num(f.construction_price) + num(f.other_charges);

  async function submit() {
    const ok = await run(async () => {
      await api.post(`/projects/${project.id}/generate-flats`, {
        floors_from: from, floors_to: to, units, size_sqft: f.size_sqft, flat_type: f.flat_type, bedrooms: Number(f.bedrooms) || 0, facing: f.facing,
        land_share_katha: f.land_share_katha || "0", land_price: f.land_price || "0", construction_price: f.construction_price || "0", other_charges: f.other_charges || "0",
      });
      await refreshAll();
      return true;
    }, t(`${count} flats created`, `${n(count)}টি ফ্ল্যাট তৈরি হয়েছে`));
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={t("Generate flats", "ফ্ল্যাট তৈরি করুন")}
      subtitle={t("One flat for every unit letter on every floor. Run it again for a different flat type.", "প্রতি তলায় প্রতিটি ইউনিটের জন্য একটি ফ্ল্যাট। ভিন্ন ধরনের ফ্ল্যাটের জন্য আবার চালান।")}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!count || !num(f.size_sqft) || clash.length > 0} onClick={submit}>{t(`Create ${count} flats`, `${n(count)}টি ফ্ল্যাট তৈরি করুন`)}</Button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label={t("From floor", "যে তলা থেকে")} required><Input className="tnum" inputMode="numeric" value={f.floors_from} onChange={(e) => setF({ ...f, floors_from: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label={t("To floor", "যে তলা পর্যন্ত")} required><Input className="tnum" inputMode="numeric" value={f.floors_to} onChange={(e) => setF({ ...f, floors_to: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label={t("Unit letters", "ইউনিট")} required className="sm:col-span-2" hint={t("Separate with commas: A, B, C", "কমা দিয়ে আলাদা করুন: A, B, C")}><Input value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} /></Field>
        <Field label={t("Size (sft)", "আয়তন (বর্গফুট)")} required><Input className="tnum" inputMode="decimal" value={f.size_sqft} onChange={(e) => setF({ ...f, size_sqft: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        <Field label={t("Type", "ধরন")}><Input value={f.flat_type} onChange={(e) => setF({ ...f, flat_type: e.target.value })} /></Field>
        <Field label={t("Bedrooms", "বেডরুম")}><Input className="tnum" inputMode="numeric" value={f.bedrooms} onChange={(e) => setF({ ...f, bedrooms: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label={t("Facing", "মুখ")}><Input value={f.facing} onChange={(e) => setF({ ...f, facing: e.target.value })} placeholder={t("South", "দক্ষিণ")} /></Field>
        <Field label={t("Land part", "জমির অংশ")} className="sm:col-span-2"><MoneyInput value={f.land_price} onChange={(v) => setF({ ...f, land_price: v })} /></Field>
        <Field label={t("Construction part", "নির্মাণের অংশ")} className="sm:col-span-2"><MoneyInput value={f.construction_price} onChange={(v) => setF({ ...f, construction_price: v })} /></Field>
        <Field label={t("Parking & utility", "পার্কিং ও ইউটিলিটি")} className="sm:col-span-2"><MoneyInput value={f.other_charges} onChange={(v) => setF({ ...f, other_charges: v })} /></Field>
        <Field label={t("Land share per flat (katha)", "ফ্ল্যাটপ্রতি জমির ভাগ (কাঠা)")} className="sm:col-span-2"><Input className="tnum" inputMode="decimal" value={f.land_share_katha} onChange={(e) => setF({ ...f, land_share_katha: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-paper-deep/70 p-4 text-sm sm:col-span-4">
          <div><div className="text-mute">{t("Flats to create", "যত ফ্ল্যাট তৈরি হবে")}</div><div className="tnum text-xl font-semibold">{n(count)}</div></div>
          <div><div className="text-mute">{t("List price each", "প্রতিটির তালিকামূল্য")}</div><div className="tnum text-xl font-semibold">{taka(list)}</div></div>
        </div>
        <div className="sm:col-span-4">
          <ErrorNote>{clash.length ? t(`Already exists: ${clash.join(", ")}. Change the floors or unit letters.`, `আগে থেকেই আছে: ${clash.join(", ")}। তলা বা ইউনিট বদলান।`) : error}</ErrorNote>
        </div>
      </div>
    </Modal>
  );
}
