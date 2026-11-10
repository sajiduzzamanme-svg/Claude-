"use client";

import { Check, FilePlus2, Lock, LockOpen, Paperclip, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Block, Panel, useOnOpen } from "@/components/project-parts";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Modal, Select, Skeleton, cn, ease, useAction } from "@/components/ui";
import { api, refreshAll, useList } from "@/lib/api";
import { ROLES, useAuth, type Role } from "@/lib/auth";
import { today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Doc, Project } from "@/lib/types";

const WRITERS: Role[] = ["OWNER", "ADMIN", "ACCOUNTS"];
const DOC_TYPES: { id: string; en: string; bn: string }[] = [
  { id: "LAND_DEED", en: "Bayna / sale deed", bn: "বায়না / সাফ কবলা দলিল" },
  { id: "KHATIAN", en: "Khatian (porcha)", bn: "খতিয়ান (পর্চা)" },
  { id: "MUTATION", en: "Mutation (namjari)", bn: "নামজারি" },
  { id: "LAND_TAX", en: "Land tax receipt", bn: "খাজনার রসিদ" },
  { id: "APPROVED_PLAN", en: "Approved building plan", bn: "অনুমোদিত নকশা" },
  { id: "DEVELOPER_REG", en: "Developer registration", bn: "ডেভেলপার নিবন্ধন" },
  { id: "SOIL_TEST", en: "Soil test report", bn: "সয়েল টেস্ট রিপোর্ট" },
  { id: "POWER_OF_ATTORNEY", en: "Power of attorney", bn: "আমমোক্তারনামা" },
  { id: "OTHER", en: "Other", bn: "অন্যান্য" },
];

export function DocumentsTab({ project }: { project: Project }) {
  const { t, n } = useT();
  const { can } = useAuth();
  const { rows: docs, loading } = useList<Doc>(`/documents?project=${project.id}`);
  const gate = useAction();
  const [add, setAdd] = useState(false);
  const writer = can(WRITERS);
  const manager = can(ROLES.MANAGERS);

  const required = docs.filter((d) => d.is_required);
  const got = required.filter((d) => d.status === "RECEIVED").length;
  const ready = required.length > 0 && got === required.length;
  const open = project.sales_open;

  const toggleSales = () => gate.run(async () => {
    await api.post(`/projects/${project.id}/${open ? "close-sales" : "open-sales"}`);
    await refreshAll();
  }, open ? t("Sales closed", "বিক্রি বন্ধ করা হয়েছে") : t("Sales are now open", "বিক্রি খোলা হয়েছে"));

  return (
    <Panel className="grid gap-5 xl:grid-cols-[minmax(0,360px)_1fr] xl:items-start">
      {/* the sales gate */}
      <Block className="xl:sticky xl:top-6">
        <div className={cn("bg-grid-night relative overflow-hidden rounded-3xl p-6 text-paper shadow-lift transition-colors duration-700", open ? "bg-[#0f2a20]" : "bg-night")}>
          <div className={cn("pointer-events-none absolute -right-10 -top-16 size-56 rounded-full blur-[90px] transition-colors duration-700", open ? "bg-leaf/50" : ready ? "bg-brass/40" : "bg-brick/40")} />
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-paper/45">{t("Sales gate", "বিক্রির গেট")}</p>
            <div className="mt-5 flex items-center gap-4">
              <motion.div
                key={open ? "open" : "shut"}
                initial={{ scale: 0.6, rotate: open ? -25 : 12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 14 }}
                className={cn("grid size-[72px] shrink-0 place-items-center rounded-2xl", open ? "bg-leaf text-white" : ready ? "bg-brass text-ink" : "bg-white/10 text-paper")}>
                {open ? <LockOpen className="size-8" /> : <Lock className="size-8" />}
              </motion.div>
              <div>
                <AnimatePresence mode="wait">
                  <motion.h2 key={open ? "o" : ready ? "r" : "l"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-2xl font-bold leading-tight tracking-tight">
                    {open ? t("Open for sale", "বিক্রি চলছে") : ready ? t("Ready to open", "খোলার জন্য প্রস্তুত") : t("Locked", "বন্ধ")}
                  </motion.h2>
                </AnimatePresence>
                <p className="mt-1 text-sm text-paper/60">
                  {open ? t("Flats of this project can be booked.", "এই প্রজেক্টের ফ্ল্যাট বুক করা যাবে।")
                    : ready ? t("Every required document is in.", "সব আবশ্যক ডকুমেন্ট পাওয়া গেছে।")
                    : t("No flat can be booked until the required papers are in.", "আবশ্যক কাগজ না আসা পর্যন্ত কোনো ফ্ল্যাট বুক করা যাবে না।")}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="text-paper/60">{t("Required documents received", "আবশ্যক ডকুমেন্ট পাওয়া গেছে")}</span>
                <span className="tnum font-semibold">{n(got)} / {n(required.length)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <motion.div className={cn("h-full rounded-full", ready ? "bg-leaf" : "bg-brass")} initial={{ width: 0 }} animate={{ width: `${required.length ? (got / required.length) * 100 : 0}%` }} transition={{ duration: 0.9, ease }} />
              </div>
            </div>

            {manager ? (
              <Button className={cn("mt-6 w-full", open && "bg-white/10 text-paper shadow-none hover:bg-white/20")} size="lg" loading={gate.busy} onClick={toggleSales}
                icon={open ? <Lock className="size-4" /> : <LockOpen className="size-4" />}>
                {open ? t("Close sales", "বিক্রি বন্ধ করুন") : t("Open sales", "বিক্রি খুলুন")}
              </Button>
            ) : (
              <p className="mt-6 flex items-center gap-2 text-xs text-paper/45"><ShieldCheck className="size-4" />{t("Only the owner or an administrator can open or close sales.", "শুধু মালিক বা অ্যাডমিন বিক্রি খুলতে বা বন্ধ করতে পারেন।")}</p>
            )}
            {gate.error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-xl bg-rose/90 px-3.5 py-2.5 text-sm text-white">{gate.error}</motion.p>}
          </div>
        </div>
      </Block>

      {/* the checklist */}
      <Block>
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">{t("Document checklist", "ডকুমেন্ট চেকলিস্ট")}</h2>
              <p className="mt-0.5 text-[13px] text-mute">{t("Tick a paper when the original is in the file. Mark which ones must be in before selling.", "মূল কাগজ ফাইলে এলে টিক দিন। বিক্রির আগে কোনগুলো আবশ্যক তা ঠিক করুন।")}</p>
            </div>
            {writer && <Button size="sm" variant="outline" icon={<FilePlus2 className="size-4" />} onClick={() => setAdd(true)}>{t("Add document", "ডকুমেন্ট যোগ করুন")}</Button>}
          </div>
          {loading && !docs.length ? <Skeleton className="h-72" /> : docs.length === 0 ? <Empty title={t("No documents listed", "কোনো ডকুমেন্ট তালিকায় নেই")} /> : (
            <ul className="space-y-2.5">
              {docs.map((d, i) => <DocRow key={d.id} doc={d} index={i} writer={writer} />)}
            </ul>
          )}
        </Card>
      </Block>

      <AddDocModal open={add} onClose={() => setAdd(false)} project={project} />
    </Panel>
  );
}

function DocRow({ doc, index, writer }: { doc: Doc; index: number; writer: boolean }) {
  const { t, date } = useT();
  const { busy, error, run } = useAction();
  const [receiving, setReceiving] = useState(false);
  const [ref, setRef] = useState("");
  const [on, setOn] = useState(today());
  const file = useRef<HTMLInputElement>(null);
  const received = doc.status === "RECEIVED";
  const type = DOC_TYPES.find((x) => x.id === doc.doc_type);
  const fileHref = doc.file ? (() => { try { return new URL(doc.file!, window.location.origin).pathname; } catch { return doc.file!; } })() : null;

  const patch = (body: Record<string, unknown> | FormData, ok: string) => run(async () => { await api.patch(`/documents/${doc.id}`, body); await refreshAll(); }, ok);

  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * index, duration: 0.35, ease }}
      className={cn("rounded-2xl border p-3.5 transition-colors sm:p-4", received ? "border-leaf/40 bg-leaf-wash/40" : doc.is_required ? "border-brass/50 bg-brass-wash/30" : "border-line")}>
      <div className="flex items-start gap-3.5">
        <button type="button" disabled={!writer || busy} aria-label={received ? t("Mark as pending", "বাকি হিসেবে চিহ্নিত করুন") : t("Mark as received", "গৃহীত হিসেবে চিহ্নিত করুন")}
          onClick={() => (received ? patch({ status: "PENDING", received_date: null }, t("Marked as pending", "বাকি হিসেবে চিহ্নিত")) : setReceiving((s) => !s))}
          className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border-2 transition", received ? "border-leaf bg-leaf text-white" : "border-ink/40 bg-white hover:border-ink", !writer && "cursor-default")}>
          <AnimatePresence>{received && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}><Check className="size-4" strokeWidth={3} /></motion.span>}</AnimatePresence>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className={cn("font-medium", received && "text-ink-soft")}>{doc.title}</span>
            {doc.is_required ? <Badge tone={received ? "leaf" : "brass"}>{t("Required", "আবশ্যক")}</Badge> : <Badge tone="neutral">{t("Optional", "ঐচ্ছিক")}</Badge>}
          </div>
          <p className="mt-0.5 text-[13px] text-mute">
            {type ? t(type.en, type.bn) : doc.doc_type}
            {received && <> · {t("received", "গৃহীত")} {date(doc.received_date)}{doc.reference_no ? ` · ${t("ref.", "রেফ.")} ${doc.reference_no}` : ""}</>}
          </p>
          {fileHref && <a href={fileHref} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-brick hover:underline"><Paperclip className="size-3.5" />{t("View scanned copy", "স্ক্যান কপি দেখুন")}</a>}
        </div>
        {writer && (
          <div className="flex shrink-0 items-center gap-1">
            <input ref={file} type="file" hidden accept="image/*,.pdf" onChange={(e) => {
              const picked = e.target.files?.[0];
              if (!picked) return;
              const fd = new FormData();
              fd.append("file", picked);
              void patch(fd, t("Scanned copy attached", "স্ক্যান কপি যুক্ত হয়েছে"));
              e.target.value = "";
            }} />
            <button type="button" title={t("Attach scanned copy", "স্ক্যান কপি যুক্ত করুন")} onClick={() => file.current?.click()} className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-paper-deep hover:text-ink"><Paperclip className="size-4" /></button>
            <button type="button" title={doc.is_required ? t("Make optional", "ঐচ্ছিক করুন") : t("Make required", "আবশ্যক করুন")} onClick={() => patch({ is_required: !doc.is_required }, t("Updated", "আপডেট হয়েছে"))}
              className={cn("relative h-5 w-9 rounded-full transition-colors", doc.is_required ? "bg-ink" : "bg-line")}>
              <motion.span layout className="absolute top-0.5 size-4 rounded-full bg-white shadow" style={{ left: doc.is_required ? 18 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
            </button>
            {received
              ? <button type="button" title={t("Mark as pending", "বাকি হিসেবে চিহ্নিত করুন")} onClick={() => patch({ status: "PENDING", received_date: null }, t("Marked as pending", "বাকি হিসেবে চিহ্নিত"))} className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-paper-deep hover:text-ink"><Undo2 className="size-4" /></button>
              : <button type="button" title={t("Remove from checklist", "চেকলিস্ট থেকে বাদ দিন")} onClick={() => run(async () => { await api.del(`/documents/${doc.id}`); await refreshAll(); }, t("Removed", "বাদ দেওয়া হয়েছে"))} className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-rose-wash hover:text-rose"><Trash2 className="size-4" /></button>}
          </div>
        )}
      </div>
      <AnimatePresence initial={false}>
        {receiving && !received && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease }} className="overflow-hidden">
            <div className="mt-3 grid gap-3 border-t border-line/70 pt-3 sm:grid-cols-[1fr_170px_auto] sm:items-end">
              <Field label={t("Reference / deed number", "রেফারেন্স / দলিল নম্বর")}><Input autoFocus value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
              <Field label={t("Received on", "প্রাপ্তির তারিখ")}><Input type="date" max={today()} value={on} onChange={(e) => setOn(e.target.value)} /></Field>
              <Button loading={busy} icon={<Check className="size-4" />} onClick={async () => { await patch({ status: "RECEIVED", reference_no: ref.trim(), received_date: on || today() }, t("Document received", "ডকুমেন্ট গৃহীত হয়েছে")); setReceiving(false); }}>{t("Mark received", "গৃহীত")}</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </motion.li>
  );
}

function AddDocModal({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const { t } = useT();
  const { busy, error, run, setError } = useAction();
  const [f, setF] = useState({ doc_type: "OTHER", title: "", is_required: true });
  useOnOpen(open, () => { setF({ doc_type: "OTHER", title: "", is_required: true }); setError(""); });
  return (
    <Modal open={open} onClose={onClose} size="sm" title={t("Add a document", "ডকুমেন্ট যোগ করুন")} subtitle={project.code}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!f.title.trim()} onClick={async () => {
          const ok = await run(async () => { await api.post("/documents", { project: project.id, ...f, title: f.title.trim() }); await refreshAll(); return true; }, t("Added to the checklist", "চেকলিস্টে যোগ হয়েছে"));
          if (ok) onClose();
        }}>{t("Add", "যোগ করুন")}</Button>
      </>}>
      <div className="space-y-4">
        <Field label={t("Kind of document", "ডকুমেন্টের ধরন")}>
          <Select value={f.doc_type} onChange={(e) => { const d = DOC_TYPES.find((x) => x.id === e.target.value)!; setF({ ...f, doc_type: d.id, title: f.title || (d.id === "OTHER" ? "" : t(d.en, d.bn)) }); }}>
            {DOC_TYPES.map((d) => <option key={d.id} value={d.id}>{t(d.en, d.bn)}</option>)}
          </Select>
        </Field>
        <Field label={t("Title", "শিরোনাম")} required><Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <label className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-3 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-brick)]" checked={f.is_required} onChange={(e) => setF({ ...f, is_required: e.target.checked })} />
          {t("Sales cannot open without it", "এটি ছাড়া বিক্রি খোলা যাবে না")}
        </label>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
