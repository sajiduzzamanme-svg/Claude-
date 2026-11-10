"use client";

import { ArrowLeft, CircleAlert, Clapperboard, Lock, MapPin, Pencil, ShoppingBag } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { STATUS_FILL, Tower, type FlatStatus } from "@/components/building";
import { StatusBadge, useLabel } from "@/components/forms";
import { ProjectFormModal } from "@/components/project-parts";
import { Page } from "@/components/shell";
import { Badge, Button, Empty, PageLoading, Tabs, rise } from "@/components/ui";
import { useApi, useList } from "@/lib/api";
import { ROLES, useAuth, type Role } from "@/lib/auth";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Flat, Project } from "@/lib/types";
import { DocumentsTab } from "./documents";
import { EstimateTab } from "./estimate";
import { FlatsTab } from "./flats";
import { MilestonesTab } from "./milestones";
import { OverviewTab } from "./overview";
import { RevisionsTab } from "./revisions";

type TabId = "overview" | "flats" | "estimate" | "documents" | "milestones" | "revisions";
const ESTIMATE_ROLES: Role[] = [...ROLES.FINANCE, "ENGINEER"];

export default function ProjectView() {
  const { id } = useParams<{ id: string }>();
  const { t, date, n } = useT();
  const { can } = useAuth();
  const label = useLabel();
  const { data: project, error } = useApi<Project>(`/projects/${id}`);
  const { rows: flats, loading: flatsLoading } = useList<Flat>(`/flats?project=${id}&page_size=500`);
  const [tab, setTab] = useState<TabId>("overview");
  const [edit, setEdit] = useState(false);

  const towerFlats = useMemo(() => flats.map((f) => ({ floor: f.floor, unit: f.unit, status: f.status })), [flats]);
  const back = (
    <Link href="/projects" className="flex items-center gap-1.5 hover:underline"><ArrowLeft className="size-3.5" />{t("All projects", "সব প্রজেক্ট")}</Link>
  );

  if (error) {
    return (
      <Page eyebrow={back} title={t("Project", "প্রজেক্ট")}>
        <Empty icon={<CircleAlert />} title={error.status === 404 ? t("This project does not exist.", "এই প্রজেক্টটি পাওয়া যায়নি।") : error.message} />
      </Page>
    );
  }
  if (!project) return <Page eyebrow={back} title={t("Project", "প্রজেক্ট")}><PageLoading /></Page>;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: t("Overview", "সারসংক্ষেপ") },
    { id: "flats", label: t("Flats", "ফ্ল্যাট"), count: project.flats_total },
    ...(can(ESTIMATE_ROLES) ? [{ id: "estimate" as const, label: t("Estimate", "এস্টিমেট") }] : []),
    { id: "documents", label: t("Documents", "ডকুমেন্ট"), count: project.documents_pending || undefined },
    { id: "milestones", label: t("Milestones", "মাইলস্টোন") },
    ...(can(ROLES.SALES_TEAM) ? [{ id: "revisions" as const, label: t("Price revisions", "দাম সংশোধন") }] : []),
  ];
  const floors = Math.max(project.storeys - 1, 0);
  const sheet = [
    { k: t("Project no.", "প্রজেক্ট নং"), v: project.code },
    { k: t("Land", "জমি"), v: num(project.land_area_katha) ? `${n(project.land_area_katha, 2)} ${t("katha", "কাঠা")}` : "—" },
    { k: t("Height", "উচ্চতা"), v: floors ? `G+${n(floors)}` : "—" },
    { k: t("Flats sold", "ফ্ল্যাট বিক্রি"), v: `${n(project.flats_sold)} / ${n(project.flats_total)}` },
    { k: t("Started", "শুরু"), v: project.start_date ? date(project.start_date) : "—" },
    { k: t("Handover", "হস্তান্তর"), v: project.expected_handover ? date(project.expected_handover) : "—" },
  ];

  return (
    <Page
      eyebrow={back}
      title={project.name}
      subtitle={<span className="flex items-center gap-1.5"><MapPin className="size-4 shrink-0" />{[project.location, project.address].filter(Boolean).join(" · ") || t("Location not set", "এলাকা দেওয়া হয়নি")}</span>}
      actions={<>
        {project.render_url && (
          <a href={project.render_url} target="_blank" rel="noreferrer">
            <Button variant="outline" icon={<Clapperboard className="size-4" />}>{t("3D & animation", "থ্রিডি ও অ্যানিমেশন")}</Button>
          </a>
        )}
        {can(ROLES.MANAGERS) && <Button variant="dark" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>{t("Edit", "সম্পাদনা")}</Button>}
      </>}
    >
      {/* drawing sheet: elevation on the left, title block on the right */}
      <motion.section variants={rise} className="mb-6 grid overflow-hidden rounded-3xl border-2 border-ink bg-card shadow-card md:grid-cols-[220px_1fr]">
        <div className="bg-grid flex items-end justify-center border-b-2 border-ink bg-paper-deep/60 px-6 pt-5 md:border-b-0 md:border-r-2">
          <Tower flats={towerFlats} storeys={project.storeys} built={num(project.progress)} width={160} height={190} delay={0.2} label={project.name} />
        </div>
        <div className="flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 px-5 py-4">
            <div className="flex w-full min-w-0 max-w-xl flex-wrap items-center gap-2 sm:w-auto sm:flex-1">
            <StatusBadge group="project" value={project.status} />
            {project.sales_open
              ? <Badge tone="leaf" dot><ShoppingBag className="size-3" />{t("Sales open", "বিক্রি চলছে")}</Badge>
              : <Badge tone="neutral"><Lock className="size-3" />{t("Sales closed", "বিক্রি বন্ধ")}</Badge>}
            {project.documents_pending > 0 && (
              <button type="button" onClick={() => setTab("documents")}>
                <Badge tone="brass">{t(`${project.documents_pending} required documents pending`, `${n(project.documents_pending)}টি আবশ্যক ডকুমেন্ট বাকি`)}</Badge>
              </button>
            )}
            {project.description && <p className="w-full text-sm text-mute">{project.description}</p>}
            </div>
            {/* key to the elevation */}
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              {(["AVAILABLE", "HOLD", "BOOKED", "HANDED_OVER"] as FlatStatus[]).map((s, i) => (
                <motion.li key={s} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.07 }}>
                  <span className="flex items-center gap-1.5 text-xs text-mute"><i className="size-3 rounded-[3px] border border-ink/50" style={{ background: STATUS_FILL[s] }} />{label("flat", s)}</span>
                  <span className="tnum block text-2xl font-bold leading-tight">{n(flats.filter((f) => f.status === s).length)}</span>
                </motion.li>
              ))}
            </ul>
          </div>
          <dl className="mt-auto grid grid-cols-2 border-t-2 border-ink sm:grid-cols-3 xl:grid-cols-6">
            {sheet.map((c, i) => (
              <motion.div key={c.k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 + i * 0.06 }}
                className="border-b border-r border-ink/20 px-4 py-3 last:border-r-0 xl:border-b-0">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">{c.k}</dt>
                <dd className="tnum mt-0.5 truncate text-[15px] font-semibold">{c.v}</dd>
              </motion.div>
            ))}
          </dl>
        </div>
      </motion.section>

      <motion.div variants={rise} className="mb-5">
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="w-fit max-w-full" />
      </motion.div>

      {tab === "overview" && <OverviewTab project={project} flats={flats} onGo={setTab} />}
      {tab === "flats" && <FlatsTab project={project} flats={flats} loading={flatsLoading} />}
      {tab === "estimate" && <EstimateTab project={project} />}
      {tab === "documents" && <DocumentsTab project={project} />}
      {tab === "milestones" && <MilestonesTab project={project} />}
      {tab === "revisions" && <RevisionsTab project={project} />}

      <ProjectFormModal open={edit} onClose={() => setEdit(false)} project={project} />
    </Page>
  );
}
