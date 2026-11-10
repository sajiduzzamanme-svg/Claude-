"use client";

import { BadgeCheck, FilePlus2, Pencil, Scale, Trash2, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { DualBar } from "@/components/charts";
import { CATEGORIES, LineItems, StatusBadge, emptyLine, lineTotal, linesPayload, type LineDraft } from "@/components/forms";
import { Block, Figure, Panel, useOnOpen } from "@/components/project-parts";
import { Badge, Button, Card, CountUp, Empty, ErrorNote, Field, Input, Modal, SectionTitle, Skeleton, cn, useAction } from "@/components/ui";
import { api, refreshAll, useApi, useList } from "@/lib/api";
import { ROLES, useAuth, type Role } from "@/lib/auth";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Estimate, Eva, Project } from "@/lib/types";

const EDITORS: Role[] = ["OWNER", "ADMIN", "ENGINEER", "ACCOUNTS"];

export function EstimateTab({ project }: { project: Project }) {
  const { t, short, taka, pct, n, date } = useT();
  const { can } = useAuth();
  const { rows: versions, loading } = useList<Estimate>(`/estimates?project=${project.id}`);
  const { data: eva } = useApi<Eva>(`/projects/${project.id}/estimate-vs-actual`);
  const { busy, error, run } = useAction();
  const [pick, setPick] = useState<number | null>(null);
  const [form, setForm] = useState<{ open: boolean; editing: Estimate | null; from: Estimate | null }>({ open: false, editing: null, from: null });

  const active = versions.find((v) => v.status === "APPROVED") ?? versions[0] ?? null;
  const shown = versions.find((v) => v.id === pick) ?? active;
  const canEdit = can(EDITORS);

  const act = (fn: () => Promise<unknown>, ok: string) => run(async () => { await fn(); await refreshAll(); }, ok);

  if (loading && !versions.length) return <div className="space-y-5"><Skeleton className="h-28" /><Skeleton className="h-96" /></div>;

  if (!versions.length) {
    return (
      <Panel>
        <Block>
          <Card><Empty icon={<Scale />} title={t("No estimate yet", "এখনো কোনো এস্টিমেট নেই")}
            hint={t("List what the land, design, construction and marketing will cost. Flat prices and profit are judged against it.", "জমি, ডিজাইন, নির্মাণ ও বিপণনে কত খরচ হবে তার তালিকা করুন। ফ্ল্যাটের দাম ও লাভ এর বিপরীতেই মাপা হয়।")}
            action={canEdit && <Button icon={<FilePlus2 className="size-4" />} onClick={() => setForm({ open: true, editing: null, from: null })}>{t("Create estimate", "এস্টিমেট তৈরি করুন")}</Button>} /></Card>
        </Block>
        <EstimateForm state={form} onClose={() => setForm((s) => ({ ...s, open: false }))} project={project} onSaved={(e) => setPick(e.id)} />
      </Panel>
    );
  }

  const totals = eva?.totals;
  const used = num(totals?.used_percent);

  return (
    <Panel className="space-y-5">
      {/* headline: budget against what has actually been spent */}
      <Block>
        <Card className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <div className="col-span-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{t("Estimated cost", "এস্টিমেট খরচ")}</div>
              <CountUp value={num(totals?.estimate)} format={(v) => short(v)} className="text-[38px] font-bold leading-none tracking-tight" />
              <div className="mt-1.5 text-xs text-mute">{eva?.estimate ? <>{t("Version", "ভার্সন")} {n(eva.estimate.version)} · <StatusBadge group="doc" value={eva.estimate.status} dot={false} /></> : null}</div>
            </div>
            <Figure label={t("Spent so far", "এ পর্যন্ত খরচ")}>{short(totals?.actual)}</Figure>
            <Figure label={num(totals?.variance) < 0 ? t("Over budget", "বাজেটের বেশি") : t("Left to spend", "খরচ বাকি")} tone={num(totals?.variance) < 0 ? "rose" : "leaf"}>{short(Math.abs(num(totals?.variance)))}</Figure>
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between text-sm">
              <span className="text-mute">{t("Budget used", "বাজেট ব্যবহার")}</span>
              <span className={cn("tnum text-lg font-bold", used > 100 && "text-rose")}>{pct(used, 1)}</span>
            </div>
            <DualBar estimate={num(totals?.estimate)} actual={num(totals?.actual)} className="h-5" />
            <div className="mt-2 flex gap-4 text-xs text-mute">
              <span className="flex items-center gap-1.5"><i className="hatch size-2.5 rounded-[3px] bg-line" />{t("Estimate", "এস্টিমেট")}</span>
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-leaf" />{t("Actual", "প্রকৃত")}</span>
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-rose" />{t("Over budget", "বাজেটের বেশি")}</span>
            </div>
          </div>
        </Card>
      </Block>

      {/* head by head */}
      <Block>
        <Card className="p-5 sm:p-6">
          <SectionTitle hint={t("Actual cost comes straight from bills, expenses and land registration in the ledger", "প্রকৃত খরচ সরাসরি লেজারের বিল, খরচ ও জমি রেজিস্ট্রি থেকে আসে")}>{t("Estimate against actual", "এস্টিমেট বনাম প্রকৃত খরচ")}</SectionTitle>
          {!eva ? <Skeleton className="h-64" /> : eva.rows.length === 0 ? <Empty title={t("Nothing to compare yet", "তুলনা করার মতো কিছু নেই")} /> : (
            <div className="space-y-6">
              {CATEGORIES.map((cat) => {
                const rows = eva.rows.filter((r) => r.category === cat.id);
                const sum = eva.categories.find((c) => c.category === cat.id);
                if (!rows.length || !sum) return null;
                return (
                  <div key={cat.id}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                      <span className="flex items-center gap-2 text-sm font-semibold"><i className="size-2.5 rounded-[3px]" style={{ background: cat.color }} />{t(cat.en, cat.bn)}</span>
                      <span className="tnum text-sm"><b className={cn("font-semibold", sum.over_budget && "text-rose")}>{short(sum.actual)}</b> <span className="text-mute">/ {short(sum.estimate)}</span></span>
                    </div>
                    <ul className="space-y-2.5">
                      {rows.map((r, i) => (
                        <motion.li key={r.cost_head} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }}
                          className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_176px]">
                          <span className="flex min-w-0 items-center gap-2 text-sm">
                            <span className="tnum w-9 shrink-0 text-xs text-mute">{r.code}</span>
                            <span className="truncate">{t(r.name, r.name_bn || r.name)}</span>
                            {r.over_budget && <TriangleAlert className="size-3.5 shrink-0 text-rose" />}
                          </span>
                          <DualBar estimate={num(r.estimate)} actual={num(r.actual)} />
                          <span className="tnum whitespace-nowrap text-right text-[13px]">
                            <b className={cn("font-semibold", r.over_budget && "text-rose")}>{short(r.actual)}</b>
                            <span className="text-mute"> / {num(r.estimate) ? short(r.estimate) : t("not budgeted", "বাজেটে নেই")}</span>
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </Block>

      {/* versions */}
      <Block>
        <Card className="p-5 sm:p-6">
          <SectionTitle hint={t("An approved estimate is never edited; a change becomes a new version", "অনুমোদিত এস্টিমেট কখনো বদলায় না; পরিবর্তন মানে নতুন ভার্সন")}
            action={canEdit && <Button size="sm" icon={<FilePlus2 className="size-4" />} onClick={() => setForm({ open: true, editing: null, from: shown })}>{t("New version", "নতুন ভার্সন")}</Button>}>
            {t("Versions", "ভার্সন")}
          </SectionTitle>
          <div className="scroll-thin -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
            {versions.map((v) => (
              <button key={v.id} type="button" onClick={() => setPick(v.id)}
                className={cn("shrink-0 rounded-2xl border px-4 py-2.5 text-left transition", shown?.id === v.id ? "border-ink bg-ink text-paper" : "border-line bg-card hover:border-ink/50")}>
                <div className="flex items-center gap-2 text-sm font-semibold">v{n(v.version)}
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", v.status === "APPROVED" ? "bg-leaf text-white" : v.status === "DRAFT" ? "bg-brass text-ink" : shown?.id === v.id ? "bg-paper/20" : "bg-paper-deep text-mute")}>
                    {v.status === "APPROVED" ? t("Approved", "অনুমোদিত") : v.status === "DRAFT" ? t("Draft", "খসড়া") : t("Superseded", "পুরোনো")}
                  </span>
                </div>
                <div className={cn("tnum mt-0.5 text-xs", shown?.id === v.id ? "text-paper/60" : "text-mute")}>{short(v.total)}</div>
              </button>
            ))}
          </div>

          {shown && (
            <motion.div key={shown.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{shown.title}</h3>
                  <p className="text-xs text-mute">
                    {shown.status === "APPROVED" && shown.approved_at ? t(`Approved by ${shown.approved_by_name ?? "—"} on ${date(shown.approved_at)}`, `${shown.approved_by_name ?? "—"} অনুমোদন করেছেন, ${date(shown.approved_at)}`) : shown.notes}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {shown.status === "DRAFT" && canEdit && <Button size="sm" variant="outline" icon={<Pencil className="size-3.5" />} onClick={() => setForm({ open: true, editing: shown, from: shown })}>{t("Edit draft", "খসড়া সম্পাদনা")}</Button>}
                  {shown.status === "DRAFT" && canEdit && <Button size="sm" variant="ghost" className="text-rose hover:bg-rose-wash" icon={<Trash2 className="size-3.5" />} loading={busy} onClick={() => act(() => api.del(`/estimates/${shown.id}`), t("Draft deleted", "খসড়া মুছে ফেলা হয়েছে")).then(() => setPick(null))}>{t("Delete", "মুছুন")}</Button>}
                  {shown.status === "DRAFT" && can(ROLES.MANAGERS) && <Button size="sm" icon={<BadgeCheck className="size-4" />} loading={busy} onClick={() => act(() => api.post(`/estimates/${shown.id}/approve`), t("Estimate approved", "এস্টিমেট অনুমোদিত হয়েছে"))}>{t("Approve", "অনুমোদন করুন")}</Button>}
                </div>
              </div>
              <ErrorNote>{error}</ErrorNote>
              <div className="scroll-thin mt-2 overflow-x-auto rounded-2xl border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-paper/70 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">
                      <th className="px-4 py-2.5">{t("Cost head", "খরচের খাত")}</th>
                      <th className="px-4 py-2.5">{t("Description", "বিবরণ")}</th>
                      <th className="px-4 py-2.5 text-right">{t("Qty × rate", "পরিমাণ × দর")}</th>
                      <th className="px-4 py-2.5 text-right">{t("Amount", "টাকা")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATEGORIES.map((cat) => {
                      const lines = shown.lines.filter((l) => l.category === cat.id);
                      if (!lines.length) return null;
                      const sub = lines.reduce((a, l) => a + num(l.amount), 0);
                      return [
                        <tr key={cat.id} className="border-t border-line bg-paper-deep/40">
                          <td colSpan={3} className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em]"><span className="flex items-center gap-2"><i className="size-2 rounded-[2px]" style={{ background: cat.color }} />{t(cat.en, cat.bn)}</span></td>
                          <td className="tnum px-4 py-2 text-right text-xs font-semibold">{taka(sub)}</td>
                        </tr>,
                        ...lines.map((l) => (
                          <tr key={l.id} className="border-t border-line/60">
                            <td className="px-4 py-2.5"><span className="tnum mr-2 text-xs text-mute">{l.cost_head_code}</span>{t(l.cost_head_name, l.cost_head_name_bn || l.cost_head_name)}</td>
                            <td className="px-4 py-2.5 text-ink-soft">{l.description || "—"}</td>
                            <td className="tnum px-4 py-2.5 text-right text-ink-soft">{num(l.rate) > 0 ? `${n(l.quantity, num(l.quantity) % 1 ? 2 : 0)} ${l.unit} × ${taka(l.rate)}` : "—"}</td>
                            <td className="tnum px-4 py-2.5 text-right font-medium">{taka(l.amount)}</td>
                          </tr>
                        )),
                      ];
                    })}
                    <tr className="border-t-2 border-ink">
                      <td colSpan={3} className="px-4 py-3 font-semibold">{t("Total estimated cost", "মোট এস্টিমেট খরচ")}</td>
                      <td className="tnum px-4 py-3 text-right text-lg font-bold">{taka(shown.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </Card>
      </Block>

      <EstimateForm state={form} onClose={() => setForm((s) => ({ ...s, open: false }))} project={project} onSaved={(e) => setPick(e.id)} />
    </Panel>
  );
}

/* ---------- create a version / edit a draft ---------- */
function EstimateForm({ state, onClose, project, onSaved }: {
  state: { open: boolean; editing: Estimate | null; from: Estimate | null }; onClose: () => void; project: Project; onSaved: (e: Estimate) => void;
}) {
  const { t, taka } = useT();
  const { busy, error, run, setError } = useAction();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  useOnOpen(state.open, () => {
    setError("");
    const src = state.editing ?? state.from;
    setTitle(state.editing ? state.editing.title : src ? t("Revised estimate", "সংশোধিত এস্টিমেট") : t("Project budget", "প্রজেক্ট বাজেট"));
    setNotes(state.editing?.notes ?? "");
    setLines(src?.lines.length ? src.lines.map((l) => ({
      cost_head: String(l.cost_head), description: l.description, unit: l.unit,
      quantity: num(l.rate) > 0 ? String(num(l.quantity)) : "1", rate: num(l.rate) > 0 ? String(num(l.rate)) : "", amount: num(l.rate) > 0 ? "" : String(num(l.amount)),
    })) : [emptyLine()]);
  });

  const payload = useMemo(() => linesPayload(lines), [lines]);
  const total = lines.reduce((a, l) => a + (l.cost_head ? lineTotal(l) : 0), 0);
  const skipped = lines.filter((l) => lineTotal(l) > 0 && !l.cost_head).length;

  async function submit() {
    const body = { project: project.id, title: title.trim(), notes, lines: payload };
    const saved = await run(async () => {
      const out = state.editing ? await api.put<Estimate>(`/estimates/${state.editing.id}`, body) : await api.post<Estimate>("/estimates", body);
      await refreshAll();
      return out;
    }, state.editing ? t("Draft saved", "খসড়া সেভ হয়েছে") : t("New version saved as draft", "নতুন ভার্সন খসড়া হিসেবে সেভ হয়েছে"));
    if (saved) {
      onSaved(saved);
      onClose();
    }
  }

  return (
    <Modal open={state.open} onClose={onClose} size="xl"
      title={state.editing ? t(`Edit draft v${state.editing.version}`, `খসড়া v${state.editing.version} সম্পাদনা`) : t("New estimate version", "নতুন এস্টিমেট ভার্সন")}
      subtitle={t("Give a rate to have quantity × rate worked out, or leave the rate empty and type a lump sum.", "দর দিলে পরিমাণ × দর হিসাব হবে; দর ফাঁকা রাখলে সরাসরি মোট টাকা লিখুন।")}
      footer={<>
        <span className="mr-auto text-sm text-mute">{t("Total", "মোট")} <b className="tnum ml-1 text-base text-ink">{taka(total)}</b></span>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!title.trim() || !payload.length} onClick={submit}>{t("Save as draft", "খসড়া হিসেবে সেভ করুন")}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Title", "শিরোনাম")} required><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label={t("Notes", "নোট")}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
        <LineItems lines={lines} onChange={setLines} />
        {skipped > 0 && <Badge tone="brass">{t(`${skipped} line(s) have no cost head and will not be saved`, `${skipped}টি লাইনে খরচের খাত নেই, সেভ হবে না`)}</Badge>}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
