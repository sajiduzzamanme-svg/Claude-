"use client";

import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { api, refreshAll } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Project } from "@/lib/types";
import { Button, ErrorNote, Field, Input, Modal, Select, Textarea, cn, rise, stagger, useAction } from "./ui";

/** Re-initialise local state in the very render in which `key` changes
 *  (React's "adjust state while rendering" pattern — no effect, no extra paint). */
export function useOnChange<K>(key: K, run: (key: K) => void) {
  const [prev, setPrev] = useState(key);
  if (!Object.is(prev, key)) {
    setPrev(key);
    run(key);
  }
}
/** Reset a dialog's form each time it opens. */
export function useOnOpen(open: boolean, reset: () => void) {
  useOnChange(open, (isOpen) => {
    if (isOpen) reset();
  });
}

/** A tab body that replays its staggered entry every time it is shown. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}
export function Block({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div variants={rise} className={className}>{children}</motion.div>;
}

/** Label over value, the way figures are noted on a drawing. */
export function Figure({ label, children, className, tone }: { label: ReactNode; children: ReactNode; className?: string; tone?: "rose" | "leaf" | "brick" }) {
  const color = tone === "rose" ? "text-rose" : tone === "leaf" ? "text-leaf" : tone === "brick" ? "text-brick-deep" : "";
  return (
    <div className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{label}</div>
      <div className={cn("tnum mt-0.5 text-lg font-semibold leading-tight", color)}>{children}</div>
    </div>
  );
}

type Draft = {
  code: string; name: string; location: string; address: string; storeys: string; land_area_katha: string;
  start_date: string; expected_handover: string; description: string; render_url: string; status: Project["status"];
};
const blank: Draft = {
  code: "", name: "", location: "", address: "", storeys: "", land_area_katha: "", start_date: "", expected_handover: "",
  description: "", render_url: "", status: "PLANNING",
};

/** Create a project, or edit one when `project` is given. */
export function ProjectFormModal({ open, onClose, project, onSaved }: {
  open: boolean; onClose: () => void; project?: Project | null; onSaved?: (p: Project) => void;
}) {
  const { t } = useT();
  const { busy, error, run, setError } = useAction();
  const [f, setF] = useState<Draft>(blank);
  useOnOpen(open, () => {
    setError("");
    setF(project ? {
      code: project.code, name: project.name, location: project.location, address: project.address,
      storeys: String(project.storeys || ""), land_area_katha: String(Number(project.land_area_katha) || ""),
      start_date: project.start_date ?? "", expected_handover: project.expected_handover ?? "",
      description: project.description, render_url: project.render_url, status: project.status,
    } : blank);
  });
  const set = (patch: Partial<Draft>) => setF((s) => ({ ...s, ...patch }));

  async function submit() {
    const body = {
      code: f.code.trim().toUpperCase(), name: f.name.trim(), location: f.location.trim(), address: f.address.trim(),
      storeys: Number(f.storeys) || 0, land_area_katha: f.land_area_katha || "0",
      start_date: f.start_date || null, expected_handover: f.expected_handover || null,
      description: f.description, render_url: f.render_url.trim(), ...(project ? { status: f.status } : {}),
    };
    const saved = await run(async () => {
      const out = project ? await api.patch<Project>(`/projects/${project.id}`, body) : await api.post<Project>("/projects", body);
      await refreshAll();
      return out;
    }, project ? t("Project updated", "প্রজেক্ট আপডেট হয়েছে") : t("Project created", "প্রজেক্ট তৈরি হয়েছে"));
    if (saved) {
      onSaved?.(saved);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={project ? t("Edit project", "প্রজেক্ট সম্পাদনা") : t("New project", "নতুন প্রজেক্ট")}
      subtitle={project ? project.code : t("A document checklist is added automatically. Sales open once it is complete.", "ডকুমেন্ট চেকলিস্ট নিজে থেকেই যোগ হবে। সেটি সম্পূর্ণ হলে বিক্রি খোলা যাবে।")}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button>
        <Button loading={busy} disabled={!f.code.trim() || !f.name.trim()} onClick={submit}>{project ? t("Save changes", "পরিবর্তন সেভ করুন") : t("Create project", "প্রজেক্ট তৈরি করুন")}</Button>
      </>}>
      <div className="grid gap-4 sm:grid-cols-6">
        <Field label={t("Code", "কোড")} required className="sm:col-span-2" hint={t("Short and unique, e.g. SU-03", "ছোট ও অনন্য, যেমন SU-03")}>
          <Input autoFocus value={f.code} maxLength={12} onChange={(e) => set({ code: e.target.value })} />
        </Field>
        <Field label={t("Project name", "প্রজেক্টের নাম")} required className="sm:col-span-4">
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={t("Location", "এলাকা")} className="sm:col-span-3"><Input value={f.location} onChange={(e) => set({ location: e.target.value })} placeholder={t("e.g. Uttara Sector 15", "যেমন: উত্তরা সেক্টর ১৫")} /></Field>
        <Field label={t("Address", "ঠিকানা")} className="sm:col-span-3"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label={t("Storeys", "তলা সংখ্যা")} className="sm:col-span-2"><Input className="tnum" inputMode="numeric" value={f.storeys} onChange={(e) => set({ storeys: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></Field>
        <Field label={t("Land area (katha)", "জমির পরিমাণ (কাঠা)")} className="sm:col-span-2"><Input className="tnum" inputMode="decimal" value={f.land_area_katha} onChange={(e) => set({ land_area_katha: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
        {project && (
          <Field label={t("Status", "অবস্থা")} className="sm:col-span-2">
            <Select value={f.status} onChange={(e) => set({ status: e.target.value as Project["status"] })}>
              <option value="PLANNING">{t("Planning", "পরিকল্পনা")}</option>
              <option value="ACTIVE">{t("Active", "চলমান")}</option>
              <option value="COMPLETED">{t("Completed", "সম্পন্ন")}</option>
              <option value="CLOSED">{t("Closed", "বন্ধ")}</option>
            </Select>
          </Field>
        )}
        <Field label={t("Start date", "শুরুর তারিখ")} className="sm:col-span-3"><Input type="date" value={f.start_date} onChange={(e) => set({ start_date: e.target.value })} /></Field>
        <Field label={t("Expected handover", "সম্ভাব্য হস্তান্তর")} className="sm:col-span-3"><Input type="date" value={f.expected_handover} onChange={(e) => set({ expected_handover: e.target.value })} /></Field>
        <Field label={t("3D render / animation link", "থ্রিডি / অ্যানিমেশনের লিংক")} className="sm:col-span-6" hint={t("Full web address, starting with https://", "পুরো ওয়েব ঠিকানা, https:// দিয়ে শুরু")}>
          <Input type="url" value={f.render_url} onChange={(e) => set({ render_url: e.target.value })} placeholder="https://" />
        </Field>
        <Field label={t("Description", "বিবরণ")} className="sm:col-span-6"><Textarea value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <div className="sm:col-span-6"><ErrorNote>{error}</ErrorNote></div>
      </div>
    </Modal>
  );
}
