"use client";

import { Lock, Pencil, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { CATEGORIES } from "@/components/forms";
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, Select, Skeleton, cn, rise, stagger, useAction, useToast } from "@/components/ui";
import { api, errorText, refreshAll, useList } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { CostHead } from "@/lib/types";

const WHERE: Record<string, { en: string; bn: string }> = {
  LAND: { en: "Capitalised as land cost of the project", bn: "প্রজেক্টের জমির খরচ হিসেবে ধরা হয়" },
  DESIGN: { en: "Capitalised as development cost", bn: "উন্নয়ন খরচ হিসেবে ধরা হয়" },
  CONSTRUCTION: { en: "Capitalised as development cost", bn: "উন্নয়ন খরচ হিসেবে ধরা হয়" },
  CONTINGENCY: { en: "Capitalised as development cost", bn: "উন্নয়ন খরচ হিসেবে ধরা হয়" },
  MARKETING: { en: "Expensed when it is spent", bn: "খরচের সময়ই ব্যয় হিসেবে ধরা হয়" },
  OVERHEAD: { en: "Expensed when it is spent", bn: "খরচের সময়ই ব্যয় হিসেবে ধরা হয়" },
};

export function CostHeads() {
  const { t, n } = useT();
  const toast = useToast();
  const { rows, loading } = useList<CostHead>("/cost-heads");
  const [editing, setEditing] = useState<CostHead | "new" | null>(null);
  const [busyId, setBusyId] = useState(0);

  async function toggle(h: CostHead) {
    setBusyId(h.id);
    try {
      await api.patch(`/cost-heads/${h.id}`, { is_active: !h.is_active });
      await refreshAll();
    } catch (e) {
      toast.err(errorText(e));
    } finally {
      setBusyId(0);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-mute">{t("Every cost is tagged with one of these, in estimates and in actual spending alike — that is what makes “estimate vs actual” possible.", "এস্টিমেট ও প্রকৃত খরচ — দুই জায়গাতেই প্রতিটি খরচ এগুলোর একটিতে পড়ে; এ কারণেই “এস্টিমেট বনাম প্রকৃত” তুলনা সম্ভব।")}</p>
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>{t("Add cost head", "খাত যোগ করুন")}</Button>
      </div>
      {loading ? <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)}</div> : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {CATEGORIES.map((c) => {
            const items = rows.filter((h) => h.category === c.id);
            return (
              <motion.div key={c.id} variants={rise}>
                <Card className="overflow-hidden">
                  <header className="flex items-center gap-3 border-b border-line px-4 py-3">
                    <span className="h-9 w-1.5 rounded-full" style={{ background: c.color }} />
                    <div className="min-w-0 flex-1"><h3 className="font-semibold leading-tight">{t(c.en, c.bn)}</h3><p className="truncate text-xs text-mute">{t(WHERE[c.id].en, WHERE[c.id].bn)}</p></div>
                    <span className="tnum rounded-full bg-paper-deep px-2 py-0.5 text-xs font-medium">{n(items.length)}</span>
                  </header>
                  <ul className="divide-y divide-line/60">
                    {items.map((h) => (
                      <li key={h.id} className={cn("group flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-paper-deep/50", !h.is_active && "opacity-50")}>
                        <span className="tnum w-9 shrink-0 text-xs font-semibold text-mute">{h.code}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{h.name}</span>{h.name_bn && <span className="block truncate text-xs text-mute">{h.name_bn}</span>}</span>
                        {h.system_key ? (
                          <span title={t("Used by the system; cannot be changed", "সিস্টেম ব্যবহার করে; বদলানো যায় না")}><Lock className="size-3.5 text-brass" /></span>
                        ) : (
                          <>
                            <button onClick={() => setEditing(h)} aria-label={t("Rename", "নাম বদলান")} className="grid size-7 place-items-center rounded-md text-mute opacity-0 transition hover:bg-paper-deep hover:text-ink group-hover:opacity-100 focus:opacity-100"><Pencil className="size-3.5" /></button>
                            <button role="switch" aria-checked={h.is_active} aria-label={t("Active", "সক্রিয়")} disabled={busyId === h.id} onClick={() => toggle(h)}
                              className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", h.is_active ? "bg-leaf" : "bg-line")}>
                              <motion.span layout className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow", h.is_active ? "right-0.5" : "left-0.5")} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                    {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-mute">{t("None yet", "এখনো নেই")}</li>}
                  </ul>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
      <HeadModal target={editing} onClose={() => setEditing(null)} existing={rows} />
    </div>
  );
}

function HeadModal({ target, onClose, existing }: { target: CostHead | "new" | null; onClose: () => void; existing: CostHead[] }) {
  const { t } = useT();
  const { busy, error, run, setError } = useAction();
  const editing = target && target !== "new" ? target : null;
  const [f, setF] = useState({ code: "", name: "", name_bn: "", category: "CONSTRUCTION" });
  useEffect(() => {
    if (!target) return;
    setError("");
    setF(editing ? { code: editing.code, name: editing.name, name_bn: editing.name_bn, category: editing.category } : { code: "", name: "", name_bn: "", category: "CONSTRUCTION" });
  }, [target, editing, setError]);

  // Suggest the next free code in the chosen category (C12 after C11, …).
  const prefix = { LAND: "L", DESIGN: "D", CONSTRUCTION: "C", MARKETING: "M", OVERHEAD: "O", CONTINGENCY: "X" }[f.category] ?? "";
  const next = `${prefix}${String(Math.max(0, ...existing.filter((h) => h.code.startsWith(prefix)).map((h) => Number(h.code.slice(1)) || 0)) + 1).padStart(2, "0")}`;

  async function save() {
    const body = { ...f, code: (f.code || next).toUpperCase() };
    const ok = await run(async () => {
      if (editing) await api.patch(`/cost-heads/${editing.id}`, body);
      else await api.post("/cost-heads", body);
      await refreshAll();
      return true;
    }, editing ? t("Cost head updated", "খাত আপডেট হয়েছে") : t("Cost head added", "খাত যোগ হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={!!target} onClose={onClose} title={editing ? t("Edit cost head", "খাত সম্পাদনা") : t("Add cost head", "খাত যোগ করুন")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button><Button loading={busy} disabled={!f.name.trim()} onClick={save}>{t("Save", "সেভ করুন")}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label={t("Category", "ধরন")} required hint={t(WHERE[f.category].en, WHERE[f.category].bn)}>
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{t(c.en, c.bn)}</option>)}
            </Select>
          </Field>
          <Field label={t("Code", "কোড")}><Input className="tnum uppercase" maxLength={12} value={f.code} placeholder={next} onChange={(e) => setF({ ...f, code: e.target.value.replace(/[^\dA-Za-z]/g, "") })} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Name (English)", "নাম (ইংরেজি)")} required><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("e.g. Waterproofing", "যেমন: Waterproofing")} /></Field>
          <Field label={t("Name (Bangla)", "নাম (বাংলা)")}><Input value={f.name_bn} onChange={(e) => setF({ ...f, name_bn: e.target.value })} placeholder="যেমন: ওয়াটারপ্রুফিং" /></Field>
        </div>
        {editing && <Badge tone="brass">{t("Changing the category moves past costs under this head to the new category in reports.", "ধরন বদলালে এই খাতের আগের খরচও রিপোর্টে নতুন ধরনে চলে যাবে।")}</Badge>}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
