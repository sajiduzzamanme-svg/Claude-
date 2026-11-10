"use client";

import { Banknote, Check, ChevronDown, FileCheck2, LandPlot, Pencil, Phone, Plus, ScrollText, Stamp, Trash2, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { CashSelect, ProjectSelect, StatusBadge, VoidModal, useLabel } from "@/components/forms";
import { useOnOpen } from "@/components/project-parts";
import { Guard, Page } from "@/components/shell";
import { Badge, Button, Card, CountUp, Empty, ErrorNote, Field, Input, KeyValue, Modal, MoneyInput, Ring, Skeleton, Textarea, cn, ease, rise, stagger, useAction } from "@/components/ui";
import { api, refreshAll, useList } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { daysFromToday, digits, num, today } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { LandParcel, LandPayment } from "@/lib/types";

type Stage = LandParcel["stage"];
const STAGES: Stage[] = ["NEGOTIATION", "BAYNA", "REGISTERED", "MUTATED"];
type Kind = "pay" | "register" | "mutate" | "form";
type ModalState = { kind: Kind; id: number | null; open: boolean };

export default function LandPage() {
  return (
    <Guard roles={ROLES.FINANCE}>
      <LandView />
    </Guard>
  );
}

function LandView() {
  const { t, short, n } = useT();
  const label = useLabel();
  const { rows, loading, error } = useList<LandParcel>("/land-parcels");
  const [project, setProject] = useState("");
  const [stage, setStage] = useState<Stage | "">("");
  const [modal, setModal] = useState<ModalState>({ kind: "form", id: null, open: false });
  const [voiding, setVoiding] = useState<LandPayment | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);

  const shown = rows.filter((p) => (!project || String(p.project) === project) && (!stage || p.stage === stage));
  const active = rows.find((p) => p.id === modal.id) ?? null;
  const show = (kind: Kind, id: number | null) => setModal({ kind, id, open: true });
  const close = () => setModal((m) => ({ ...m, open: false }));

  const totals = useMemo(() => {
    const scope = rows.filter((p) => !project || String(p.project) === project);
    const agreed = scope.reduce((a, p) => a + num(p.agreed_price), 0);
    const paid = scope.reduce((a, p) => a + num(p.paid), 0);
    const registered = scope.filter((p) => p.stage === "REGISTERED" || p.stage === "MUTATED");
    const owed = registered.reduce((a, p) => a + num(p.remaining), 0);
    const bayna = scope.filter((p) => p.stage === "NEGOTIATION" || p.stage === "BAYNA").reduce((a, p) => a + num(p.remaining), 0);
    const katha = scope.reduce((a, p) => a + num(p.area_katha), 0);
    return { agreed, paid, owed, bayna, katha, count: scope.length };
  }, [rows, project]);

  return (
    <Page
      eyebrow={<><LandPlot className="size-3.5" />{t("Land bank", "জমির হিসাব")}</>}
      title={t("Land", "জমি")}
      subtitle={t("From the first talk with the owner to mutation in the company's name: what was agreed, what is paid, and what falls due when.", "মালিকের সাথে প্রথম আলোচনা থেকে কোম্পানির নামে নামজারি পর্যন্ত: কত ঠিক হয়েছে, কত দেওয়া হয়েছে, কবে কত দিতে হবে।")}
      actions={<Button icon={<Plus className="size-4" />} onClick={() => show("form", null)}>{t("Add land", "জমি যোগ করুন")}</Button>}
    >
      {/* the position, as one measured strip */}
      <motion.section variants={rise} className="mb-6 overflow-hidden rounded-3xl border-2 border-ink bg-card shadow-card">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[auto_1fr] lg:items-end">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mute">{t("Agreed for all land", "সব জমির চুক্তিমূল্য")}</div>
            <CountUp value={totals.agreed} format={(v) => short(v)} className="text-[48px] font-bold leading-none tracking-tight sm:text-[56px]" />
            <div className="mt-1.5 text-sm text-mute">{t(`${totals.count} parcel(s) · ${totals.katha.toFixed(2)} katha`, `${n(totals.count)}টি জমি · ${n(totals.katha, 2)} কাঠা`)}</div>
          </div>
          <div>
            <div className="flex h-6 overflow-hidden rounded-lg border border-ink/20 bg-paper-deep">
              {[
                { v: totals.paid, c: "bg-leaf", d: 0.15 },
                { v: totals.owed, c: "bg-brass", d: 0.3 },
                { v: totals.bayna, c: "bg-rose hatch", d: 0.45 },
              ].map((s, i) => (
                <motion.div key={i} className={s.c} initial={{ width: 0 }} animate={{ width: `${totals.agreed ? (s.v / totals.agreed) * 100 : 0}%` }} transition={{ duration: 1, ease, delay: s.d }} />
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Strip color="bg-leaf" label={t("Paid to owners", "মালিককে পরিশোধ")} value={short(totals.paid)} />
              <Strip color="bg-brass" label={t("Owed on registered land", "নিবন্ধিত জমিতে বাকি")} value={short(totals.owed)} />
              <Strip color="bg-rose" label={t("Still to pay on bayna land", "বায়নার জমিতে বাকি")} value={short(totals.bayna)} danger={totals.bayna > 0}
                hint={t("Not yet ours — must be paid before the deadline", "এখনো নিজেদের নয় — সময়সীমার আগে দিতে হবে")} />
            </div>
          </div>
        </div>
      </motion.section>

      <motion.div variants={rise} className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-64 max-w-full"><ProjectSelect value={project} onChange={setProject} all={t("All projects", "সব প্রজেক্ট")} /></div>
        <div className="scroll-thin flex gap-1.5 overflow-x-auto">
          {(["", ...STAGES] as const).map((s) => {
            const count = rows.filter((p) => (!project || String(p.project) === project) && (!s || p.stage === s)).length;
            return (
              <button key={s || "all"} type="button" onClick={() => setStage(s)}
                className={cn("whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition", stage === s ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink-soft hover:border-ink/50")}>
                {s ? label("land", s) : t("Every stage", "সব ধাপ")} <span className="tnum ml-1 opacity-60">{n(count)}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {error ? <Card><Empty title={error.message} /></Card>
        : loading && !rows.length ? <div className="grid gap-5 xl:grid-cols-2"><Skeleton className="h-[420px]" /><Skeleton className="h-[420px]" /></div>
        : shown.length === 0 ? (
          <Card><Empty icon={<ScrollText />} title={rows.length ? t("No land matches this filter", "এই ফিল্টারে কোনো জমি নেই") : t("No land recorded yet", "এখনো কোনো জমি যোগ হয়নি")}
            hint={t("Add a parcel as soon as talks begin, then record the bayna and each payment.", "আলোচনা শুরু হলেই জমি যোগ করুন, তারপর বায়না ও প্রতিটি পেমেন্ট লিখুন।")}
            action={<Button icon={<Plus className="size-4" />} onClick={() => show("form", null)}>{t("Add land", "জমি যোগ করুন")}</Button>} /></Card>
        ) : (
          <motion.div variants={stagger} className="grid gap-5 xl:grid-cols-2">
            {shown.map((p) => <Deed key={p.id} p={p} onAct={(k) => show(k, p.id)} onVoid={(pay) => { setVoiding(pay); setVoidOpen(true); }} />)}
          </motion.div>
        )}

      <ParcelForm open={modal.open && modal.kind === "form"} onClose={close} parcel={modal.kind === "form" ? active : null} />
      <PayModal open={modal.open && modal.kind === "pay"} onClose={close} parcel={active} />
      <RegisterModal open={modal.open && modal.kind === "register"} onClose={close} parcel={active} />
      <MutateModal open={modal.open && modal.kind === "mutate"} onClose={close} parcel={active} />
      <VoidModal open={voidOpen} onClose={() => setVoidOpen(false)}
        title={voiding ? t(`Void payment ${voiding.number}?`, `পেমেন্ট ${voiding.number} বাতিল করবেন?`) : ""}
        onConfirm={(reason) => api.post(`/land-payments/${voiding!.id}/void`, { reason })} />
    </Page>
  );
}

function Strip({ color, label, value, hint, danger }: { color: string; label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[13px] text-mute"><i className={cn("size-2.5 rounded-[3px]", color)} />{label}</div>
      <div className={cn("tnum mt-0.5 text-2xl font-semibold tracking-tight", danger && "text-rose")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-mute">{hint}</div>}
    </div>
  );
}

/* ---------- one parcel, drawn like its deed ---------- */
function Deed({ p, onAct, onVoid }: { p: LandParcel; onAct: (k: Kind) => void; onVoid: (pay: LandPayment) => void }) {
  const { t, taka, short, date, n, pct, lang } = useT();
  const { can } = useAuth();
  const label = useLabel();
  const [history, setHistory] = useState(false);
  const stageIndex = STAGES.indexOf(p.stage);
  const registered = stageIndex >= 2;
  const agreed = num(p.agreed_price), paid = num(p.paid), remaining = num(p.remaining);
  const days = daysFromToday(p.registration_deadline);
  // how long the bayna gives us, from the bayna date to the deadline
  const span = p.bayna_date && p.registration_deadline ? Math.max((daysFromToday(p.registration_deadline) ?? 0) - (daysFromToday(p.bayna_date) ?? 0), 1) : 90;
  const urgency = days === null ? "none" : days < 0 ? "late" : days <= 30 ? "hot" : days <= 60 ? "warm" : "calm";
  const ringColor = { none: "var(--color-mute)", late: "var(--color-rose)", hot: "var(--color-rose)", warm: "var(--color-brass)", calm: "var(--color-leaf)" }[urgency];
  const stageDates: (string | null)[] = [null, p.bayna_date, p.registration_date, p.mutation_date];
  const posted = p.payments.filter((x) => x.status === "POSTED").length;

  return (
    <motion.article variants={rise} layout className="group relative flex rounded-[22px] border-2 border-ink bg-card p-1.5 shadow-card transition-shadow duration-300 hover:shadow-lift">
      <div className="min-w-0 flex-1 rounded-[16px] border border-dashed border-ink/35">
        {/* header band */}
        <div className="hatch flex items-center justify-between gap-3 rounded-t-[15px] border-b border-dashed border-ink/35 px-5 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-ink-soft">{t("Land record", "জমির দলিল")} · {p.project_code}</span>
          <span className="tnum text-[11px] font-semibold text-ink-soft">{t("No.", "নং")} {digits(String(p.id).padStart(4, "0"), lang)}</span>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold leading-snug tracking-tight">{p.title}</h2>
                <StatusBadge group="land" value={p.stage} />
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {t("Owner", "মালিক")}: <span className="font-medium text-ink">{p.owner_name}</span>
                {p.owner_phone && <a href={`tel:${p.owner_phone}`} className="tnum ml-2 inline-flex items-center gap-1 text-mute hover:text-brick"><Phone className="size-3" />{p.owner_phone}</a>}
              </p>
            </div>
            {/* countdown, or the registrar's seal */}
            {registered ? (
              <motion.div initial={{ scale: 0.5, rotate: -30, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 13, delay: 0.25 }}
                className="grid size-[84px] shrink-0 place-items-center rounded-full border-[3px] border-double border-leaf text-leaf">
                <div className="text-center leading-tight">
                  <Stamp className="mx-auto size-5" />
                  <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em]">{p.stage === "MUTATED" ? t("Mutated", "নামজারি") : t("Registered", "রেজিস্ট্রি")}</div>
                </div>
              </motion.div>
            ) : (
              <div className="shrink-0 text-center">
                <Ring value={days === null ? 0 : days < 0 ? 100 : Math.min(100, Math.max(4, 100 - (days / span) * 100))} size={84} stroke={8} color={ringColor} delay={0.2}>
                  {days === null ? <span className="px-1 text-[10px] font-medium leading-tight text-mute">{t("No deadline", "সময়সীমা নেই")}</span> : (
                    <span className="leading-none">
                      <span className={cn("tnum block text-xl font-bold", (urgency === "late" || urgency === "hot") && "text-rose")}>{n(Math.abs(days))}</span>
                      <span className="text-[10px] font-medium text-mute">{days < 0 ? t("days late", "দিন দেরি") : t("days left", "দিন বাকি")}</span>
                    </span>
                  )}
                </Ring>
              </div>
            )}
          </div>

          {/* the particulars */}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-y border-dashed border-ink/25 py-3.5 text-sm sm:grid-cols-4">
            <Part k={t("Area", "পরিমাণ")} v={`${n(p.area_katha, 2)} ${t("katha", "কাঠা")}`} />
            <Part k={t("Mouza", "মৌজা")} v={p.mouza || "—"} />
            <Part k={t("Khatian", "খতিয়ান")} v={p.khatian_no || "—"} />
            <Part k={t("Dag", "দাগ")} v={p.dag_no || "—"} />
            {p.bayna_deed_no && <Part k={t("Bayna deed", "বায়না দলিল")} v={p.bayna_deed_no} />}
            {p.deed_no && <Part k={t("Sale deed", "সাফ কবলা")} v={p.deed_no} />}
            {!registered && p.registration_deadline && <Part k={t("Register by", "রেজিস্ট্রির শেষ তারিখ")} v={date(p.registration_deadline)} danger={urgency === "late" || urgency === "hot"} />}
            <Part k={t("Rate per katha", "কাঠাপ্রতি দর")} v={short(num(p.area_katha) ? agreed / num(p.area_katha) : 0)} />
          </dl>

          {/* stage rail */}
          <div className="relative mt-5 px-3">
            <div className="absolute left-3 right-3 top-[11px] h-[3px] rounded-full bg-paper-deep" />
            <motion.div className="absolute left-3 top-[11px] h-[3px] rounded-full bg-ink" initial={{ width: 0 }} animate={{ width: `calc((100% - 24px) * ${stageIndex / 3})` }} transition={{ duration: 1, ease, delay: 0.2 }} />
            <ol className="relative flex justify-between">
              {STAGES.map((s, i) => {
                const reached = i <= stageIndex;
                return (
                  <li key={s} className={cn("flex w-0 flex-col items-center text-center", i === 0 && "items-start text-left", i === 3 && "items-end text-right")}>
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.25 + i * 0.16 }}
                      className={cn("grid size-[25px] place-items-center rounded-full border-2", reached ? "border-ink bg-ink text-paper" : "border-line bg-card", i === stageIndex && "ring-4 ring-brass/40")}>
                      {reached && <Check className="size-3.5" strokeWidth={3} />}
                    </motion.span>
                    {/* fixed-width captions so neighbours never collide on a phone */}
                    <span className={cn("mt-1.5 w-[74px] text-[11px] font-medium leading-tight sm:w-28 sm:text-[11.5px]", reached ? "text-ink" : "text-mute")}>{label("land", s)}</span>
                    <span className="tnum mt-0.5 w-[74px] text-[10px] leading-tight text-mute sm:w-28 sm:text-[10.5px]">{stageDates[i] ? date(stageDates[i]) : " "}</span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* money */}
          <div className="mt-5 rounded-2xl bg-paper/80 p-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-sm text-mute">{t("Paid of agreed price", "চুক্তিমূল্যের মধ্যে পরিশোধ")}</span>
              <span className="tnum text-sm"><b className="text-base font-semibold">{taka(paid)}</b> <span className="text-mute">/ {taka(agreed)}</span></span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-paper-deep">
              <motion.div className={cn("h-full rounded-full", remaining <= 0 ? "bg-leaf" : registered ? "bg-brass" : "bg-brick")} initial={{ width: 0 }} whileInView={{ width: `${agreed ? (paid / agreed) * 100 : 0}%` }} viewport={{ once: true }} transition={{ duration: 1, ease, delay: 0.15 }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[13px]">
              <span className="tnum text-mute">{pct(agreed ? (paid / agreed) * 100 : 0, 1)} {t("paid", "পরিশোধিত")}</span>
              {remaining > 0
                ? <span>{registered ? t("Owed to the landowner", "জমির মালিকের পাওনা") : t("Still to pay", "এখনো বাকি")} <b className={cn("tnum ml-1 font-semibold", !registered && "text-rose")}>{taka(remaining)}</b></span>
                : <Badge tone="leaf" dot>{t("Paid in full", "সম্পূর্ণ পরিশোধিত")}</Badge>}
            </div>
          </div>

          {p.notes && <p className="mt-3 text-[13px] italic text-ink-soft">{p.notes}</p>}

          {/* actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {remaining > 0 && <Button size="sm" icon={<Banknote className="size-4" />} onClick={() => onAct("pay")}>{t("Pay landowner", "মালিককে টাকা দিন")}</Button>}
            {!registered && can(ROLES.MANAGERS) && <Button size="sm" variant="dark" icon={<Stamp className="size-4" />} onClick={() => onAct("register")}>{t("Record registration", "রেজিস্ট্রি লিখুন")}</Button>}
            {p.stage === "REGISTERED" && <Button size="sm" variant="dark" icon={<FileCheck2 className="size-4" />} onClick={() => onAct("mutate")}>{t("Record mutation", "নামজারি লিখুন")}</Button>}
            <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => onAct("form")}>{t("Edit", "সম্পাদনা")}</Button>
            <button type="button" onClick={() => setHistory((s) => !s)} className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-ink-soft transition hover:bg-paper-deep">
              {t(`${posted} payment(s)`, `${n(posted)}টি পেমেন্ট`)}
              <motion.span animate={{ rotate: history ? 180 : 0 }}><ChevronDown className="size-4" /></motion.span>
            </button>
          </div>

          <AnimatePresence initial={false}>
            {history && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }} className="overflow-hidden">
                {p.payments.length === 0 ? <p className="pt-4 text-center text-sm text-mute">{t("No payments recorded yet.", "এখনো কোনো পেমেন্ট লেখা হয়নি।")}</p> : (
                  <ul className="mt-4 divide-y divide-line/70 border-t border-line/70">
                    {p.payments.map((pay) => (
                      <li key={pay.id} className={cn("flex items-center gap-3 py-2.5 text-sm", pay.status === "VOIDED" && "opacity-55")}>
                        <span className="min-w-0 flex-1">
                          <span className={cn("tnum block font-medium", pay.status === "VOIDED" && "line-through")}>{date(pay.date)} · {pay.number}</span>
                          <span className="block truncate text-xs text-mute">
                            {pay.paid_from_name}{pay.reference ? ` · ${pay.reference}` : ""}{pay.note ? ` · ${pay.note}` : ""}
                            {pay.status === "VOIDED" && <> · {t("voided", "বাতিল")}: {pay.void_reason}</>}
                          </span>
                        </span>
                        <span className={cn("tnum font-semibold", pay.status === "VOIDED" && "line-through")}>{taka(pay.amount)}</span>
                        {pay.status === "POSTED"
                          ? <button type="button" title={t("Void this payment", "এই পেমেন্ট বাতিল করুন")} onClick={() => onVoid(pay)} className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-rose-wash hover:text-rose"><Undo2 className="size-4" /></button>
                          : <span className="w-8" />}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.article>
  );
}

function Part({ k, v, danger }: { k: string; v: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-mute">{k}</dt>
      <dd className={cn("tnum truncate font-medium", danger && "text-rose")}>{v}</dd>
    </div>
  );
}

/* ---------- add / edit a parcel ---------- */
type Draft = { project: string; title: string; mouza: string; khatian_no: string; dag_no: string; area_katha: string; owner_name: string; owner_phone: string; agreed_price: string; bayna_date: string; bayna_deed_no: string; registration_deadline: string; notes: string };
const blankParcel: Draft = { project: "", title: "", mouza: "", khatian_no: "", dag_no: "", area_katha: "", owner_name: "", owner_phone: "", agreed_price: "", bayna_date: "", bayna_deed_no: "", registration_deadline: "", notes: "" };

function ParcelForm({ open, onClose, parcel }: { open: boolean; onClose: () => void; parcel: LandParcel | null }) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const [f, setF] = useState<Draft>(blankParcel);
  // Remember what is being edited so the dialog keeps its content while closing.
  const [editing, setEditing] = useState<LandParcel | null>(null);
  useOnOpen(open, () => {
    setError("");
    setEditing(parcel);
    setF(parcel ? {
      project: String(parcel.project), title: parcel.title, mouza: parcel.mouza, khatian_no: parcel.khatian_no, dag_no: parcel.dag_no,
      area_katha: String(num(parcel.area_katha)), owner_name: parcel.owner_name, owner_phone: parcel.owner_phone, agreed_price: String(num(parcel.agreed_price)),
      bayna_date: parcel.bayna_date ?? "", bayna_deed_no: parcel.bayna_deed_no, registration_deadline: parcel.registration_deadline ?? "", notes: parcel.notes,
    } : blankParcel);
  });
  const set = (patch: Partial<Draft>) => setF((s) => ({ ...s, ...patch }));
  const locked = !!editing && (editing.stage === "REGISTERED" || editing.stage === "MUTATED");
  const hasPayments = !!editing && editing.payments.length > 0;
  const perKatha = num(f.area_katha) ? num(f.agreed_price) / num(f.area_katha) : 0;
  const valid = f.project && f.title.trim() && f.owner_name.trim() && num(f.area_katha) > 0 && num(f.agreed_price) > 0;

  async function submit() {
    const body = {
      project: Number(f.project), title: f.title.trim(), mouza: f.mouza, khatian_no: f.khatian_no, dag_no: f.dag_no, area_katha: f.area_katha,
      owner_name: f.owner_name.trim(), owner_phone: f.owner_phone, agreed_price: f.agreed_price, bayna_date: f.bayna_date || null,
      bayna_deed_no: f.bayna_deed_no, registration_deadline: f.registration_deadline || null, notes: f.notes,
    };
    const ok = await run(async () => {
      if (editing) await api.patch(`/land-parcels/${editing.id}`, body);
      else await api.post("/land-parcels", body);
      await refreshAll();
      return true;
    }, editing ? t("Land record updated", "জমির তথ্য আপডেট হয়েছে") : t("Land added", "জমি যোগ হয়েছে"));
    if (ok) onClose();
  }
  async function remove() {
    const ok = await run(async () => { await api.del(`/land-parcels/${editing!.id}`); await refreshAll(); return true; }, t("Land record deleted", "জমির রেকর্ড মুছে ফেলা হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={editing ? t("Edit land record", "জমির তথ্য সম্পাদনা") : t("Add land", "জমি যোগ করুন")}
      subtitle={editing ? editing.title : t("Record it at the negotiation stage; the first payment turns it into bayna.", "আলোচনার ধাপেই লিখে রাখুন; প্রথম পেমেন্ট দিলেই এটি বায়না হয়ে যাবে।")}
      footer={<>
        {editing && !hasPayments && <Button variant="ghost" className="mr-auto text-rose hover:bg-rose-wash" icon={<Trash2 className="size-4" />} loading={busy} onClick={remove}>{t("Delete", "মুছুন")}</Button>}
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!valid} onClick={submit}>{editing ? t("Save changes", "পরিবর্তন সেভ করুন") : t("Add land", "জমি যোগ করুন")}</Button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-6">
        <Field label={t("Project", "প্রজেক্ট")} required className="sm:col-span-3">
          {hasPayments ? <Input disabled value={`${editing!.project_code} — ${editing!.project_name}`} /> : <ProjectSelect value={f.project} onChange={(v) => set({ project: v })} />}
        </Field>
        <Field label={t("Plot / description", "প্লট / বিবরণ")} required className="sm:col-span-3"><Input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder={t("e.g. Uttara Sector 15, Plot 22", "যেমন: উত্তরা সেক্টর ১৫, প্লট ২২")} /></Field>
        <Field label={t("Mouza", "মৌজা")} className="sm:col-span-2"><Input value={f.mouza} onChange={(e) => set({ mouza: e.target.value })} /></Field>
        <Field label={t("Khatian no.", "খতিয়ান নং")} className="sm:col-span-2"><Input value={f.khatian_no} onChange={(e) => set({ khatian_no: e.target.value })} /></Field>
        <Field label={t("Dag no.", "দাগ নং")} className="sm:col-span-2"><Input value={f.dag_no} onChange={(e) => set({ dag_no: e.target.value })} /></Field>
        <Field label={t("Landowner", "জমির মালিক")} required className="sm:col-span-4"><Input value={f.owner_name} onChange={(e) => set({ owner_name: e.target.value })} /></Field>
        <Field label={t("Owner's phone", "মালিকের ফোন")} className="sm:col-span-2"><Input className="tnum" inputMode="tel" value={f.owner_phone} onChange={(e) => set({ owner_phone: e.target.value })} /></Field>
        <Field label={t("Area (katha)", "পরিমাণ (কাঠা)")} required className="sm:col-span-2"><Input className="tnum" inputMode="decimal" value={f.area_katha} onChange={(e) => set({ area_katha: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        <Field label={t("Agreed price", "চুক্তিমূল্য")} required className="sm:col-span-4"
          hint={locked ? t("Locked: the land is registered at this price.", "লক করা: এই দামেই জমি রেজিস্ট্রি হয়েছে।") : perKatha ? t(`${taka(perKatha)} per katha`, `কাঠাপ্রতি ${taka(perKatha)}`) : undefined}>
          <MoneyInput value={f.agreed_price} onChange={(v) => set({ agreed_price: v })} disabled={locked} />
        </Field>
        <Field label={t("Bayna date", "বায়নার তারিখ")} className="sm:col-span-2"><Input type="date" value={f.bayna_date} onChange={(e) => set({ bayna_date: e.target.value })} /></Field>
        <Field label={t("Bayna deed no.", "বায়না দলিল নং")} className="sm:col-span-2"><Input value={f.bayna_deed_no} onChange={(e) => set({ bayna_deed_no: e.target.value })} /></Field>
        <Field label={t("Register by", "রেজিস্ট্রির শেষ তারিখ")} className="sm:col-span-2" hint={t("Drives the deadline alerts", "এই তারিখ থেকেই সতর্কবার্তা আসে")}><Input type="date" value={f.registration_deadline} onChange={(e) => set({ registration_deadline: e.target.value })} disabled={locked} /></Field>
        <Field label={t("Notes", "নোট")} className="sm:col-span-6"><Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <div className="sm:col-span-6"><ErrorNote>{error}</ErrorNote></div>
      </div>
    </Modal>
  );
}

/* ---------- pay the landowner ---------- */
function PayModal({ open, onClose, parcel }: { open: boolean; onClose: () => void; parcel: LandParcel | null }) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const [f, setF] = useState({ date: today(), amount: "", paid_from: "", reference: "", note: "" });
  useOnOpen(open, () => { setF({ date: today(), amount: "", paid_from: "", reference: "", note: "" }); setError(""); });
  const remaining = num(parcel?.remaining);
  const amount = num(f.amount);
  const tooMuch = amount > remaining + 0.001;
  const registered = parcel?.stage === "REGISTERED" || parcel?.stage === "MUTATED";

  async function submit() {
    if (!parcel) return;
    const ok = await run(async () => {
      await api.post(`/land-parcels/${parcel.id}/pay`, { ...f, paid_from: Number(f.paid_from) });
      await refreshAll();
      return true;
    }, t("Payment recorded", "পেমেন্ট লেখা হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={open && !!parcel} onClose={onClose} title={t("Pay landowner", "জমির মালিককে টাকা দিন")} subtitle={parcel && `${parcel.owner_name} · ${parcel.title}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!amount || tooMuch || !f.paid_from} onClick={submit}>{t("Record payment", "পেমেন্ট সেভ করুন")}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-2xl bg-paper-deep/70 p-4 text-sm">
          <div><div className="text-mute">{t("Agreed price", "চুক্তিমূল্য")}</div><div className="tnum text-lg font-semibold">{taka(parcel?.agreed_price)}</div></div>
          <div><div className="text-mute">{t("Still to pay", "এখনো বাকি")}</div><div className="tnum text-lg font-semibold text-brick-deep">{taka(remaining)}</div></div>
        </div>
        <Field label={t("Amount", "টাকার পরিমাণ")} required error={tooMuch ? t(`More than is left to pay (${taka(remaining)}).`, `বাকির (${taka(remaining)}) চেয়ে বেশি।`) : undefined}>
          <MoneyInput autoFocus value={f.amount} onChange={(v) => setF({ ...f, amount: v })} className="h-12 text-lg" />
        </Field>
        {remaining > 0 && (
          <div className="-mt-1 flex flex-wrap gap-2">
            {[{ l: t("Full balance", "পুরো বাকি"), v: remaining }, { l: t("Half", "অর্ধেক"), v: Math.round(remaining / 2) }].map((c) => (
              <button key={c.l} type="button" onClick={() => setF({ ...f, amount: String(c.v) })} className="rounded-full border border-line bg-card px-3 py-1 text-xs font-medium transition hover:border-ink hover:bg-brass-wash">{c.l} · <span className="tnum">{taka(c.v)}</span></button>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Date", "তারিখ")} required><Input type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={t("Paid from", "যে হিসাব থেকে")} required><CashSelect value={f.paid_from} onChange={(v) => setF((s) => ({ ...s, paid_from: v }))} /></Field>
          <Field label={t("Cheque / reference", "চেক / রেফারেন্স")}><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
          <Field label={t("Note", "নোট")}><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
        <p className="rounded-xl bg-sky-wash/70 px-3.5 py-2.5 text-[13px] text-ink-soft">
          {registered
            ? t("The land is registered, so this reduces what the company owes the landowner.", "জমি রেজিস্ট্রি হয়ে গেছে, তাই এতে জমির মালিকের কাছে কোম্পানির দেনা কমবে।")
            : t("Until the deed is registered this is held in the books as a bayna advance, not as land cost.", "দলিল রেজিস্ট্রি না হওয়া পর্যন্ত এটি হিসাবে জমির খরচ নয়, বায়না অগ্রিম হিসেবে থাকবে।")}
        </p>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

/* ---------- registration: advance becomes land cost ---------- */
function RegisterModal({ open, onClose, parcel }: { open: boolean; onClose: () => void; parcel: LandParcel | null }) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const [f, setF] = useState({ date: today(), deed_no: "" });
  useOnOpen(open, () => { setF({ date: today(), deed_no: "" }); setError(""); });

  async function submit() {
    if (!parcel) return;
    const ok = await run(async () => { await api.post(`/land-parcels/${parcel.id}/register`, { date: f.date, deed_no: f.deed_no.trim() }); await refreshAll(); return true; }, t("Registration recorded", "রেজিস্ট্রি লেখা হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={open && !!parcel} onClose={onClose} title={t("Record registration", "রেজিস্ট্রি লিখুন")} subtitle={parcel?.title}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button variant="dark" icon={<Stamp className="size-4" />} loading={busy} disabled={!f.deed_no.trim() || !f.date} onClick={submit}>{t("Deed is registered", "দলিল রেজিস্ট্রি হয়েছে")}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Registration date", "রেজিস্ট্রির তারিখ")} required><Input type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={t("Sale deed number", "সাফ কবলা দলিল নম্বর")} required><Input autoFocus value={f.deed_no} onChange={(e) => setF({ ...f, deed_no: e.target.value })} /></Field>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-mute">{t("What this does in the books", "হিসাবে যা ঘটবে")}</p>
          <KeyValue label={t("Becomes land cost of the project", "প্রজেক্টের জমির খরচ হবে")}>{taka(parcel?.agreed_price)}</KeyValue>
          <KeyValue label={t("Bayna advance already paid", "ইতিমধ্যে দেওয়া বায়না অগ্রিম")}>{taka(parcel?.paid)}</KeyValue>
          <KeyValue label={t("Becomes owed to the landowner", "জমির মালিকের পাওনা হবে")}><span className={cn(num(parcel?.remaining) > 0 && "text-brick-deep")}>{taka(parcel?.remaining)}</span></KeyValue>
        </div>
        <p className="text-[13px] text-mute">{t("After this the agreed price can no longer be changed.", "এরপর চুক্তিমূল্য আর বদলানো যাবে না।")}</p>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}

function MutateModal({ open, onClose, parcel }: { open: boolean; onClose: () => void; parcel: LandParcel | null }) {
  const { t } = useT();
  const { busy, error, run, setError } = useAction();
  const [on, setOn] = useState(today());
  useOnOpen(open, () => { setOn(today()); setError(""); });
  return (
    <Modal open={open && !!parcel} onClose={onClose} size="sm" title={t("Record mutation", "নামজারি লিখুন")} subtitle={parcel?.title}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button variant="dark" icon={<FileCheck2 className="size-4" />} loading={busy} disabled={!on} onClick={async () => {
          const ok = await run(async () => { await api.post(`/land-parcels/${parcel!.id}/mutate`, { date: on }); await refreshAll(); return true; }, t("Mutation recorded", "নামজারি লেখা হয়েছে"));
          if (ok) onClose();
        }}>{t("Mutation is done", "নামজারি সম্পন্ন")}</Button>
      </>}>
      <div className="space-y-4">
        <Field label={t("Mutation date", "নামজারির তারিখ")} required hint={t("The day the land was mutated in the company's name", "যেদিন কোম্পানির নামে নামজারি হয়েছে")}><Input type="date" max={today()} value={on} onChange={(e) => setOn(e.target.value)} /></Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
