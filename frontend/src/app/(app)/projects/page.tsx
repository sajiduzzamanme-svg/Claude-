"use client";

import { ArrowUpRight, Building2, CalendarDays, FileWarning, Lock, MapPin, Plus, ShoppingBag } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Tower, type TowerFlat } from "@/components/building";
import { StatusBadge, useProjects } from "@/components/forms";
import { ProjectFormModal } from "@/components/project-parts";
import { Page } from "@/components/shell";
import { Badge, Bar, Button, Card, CountUp, Empty, Ring, Skeleton, cn, rise, stagger } from "@/components/ui";
import { useList } from "@/lib/api";
import { ROLES, useAuth } from "@/lib/auth";
import { num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Flat, Project } from "@/lib/types";

export default function ProjectsPage() {
  const { t, n } = useT();
  const { can } = useAuth();
  const router = useRouter();
  const { rows: projects, loading, error } = useProjects();
  const { rows: flats } = useList<Flat>("/flats?page_size=1000");
  const [create, setCreate] = useState(false);

  const flatsByProject = useMemo(() => {
    const map = new Map<number, TowerFlat[]>();
    for (const f of flats) map.set(f.project, [...(map.get(f.project) ?? []), { floor: f.floor, unit: f.unit, status: f.status }]);
    return map;
  }, [flats]);

  const totals = useMemo(() => ({
    projects: projects.length,
    flats: projects.reduce((a, p) => a + p.flats_total, 0),
    sold: projects.reduce((a, p) => a + p.flats_sold, 0),
    open: projects.filter((p) => p.sales_open).length,
  }), [projects]);

  return (
    <Page
      eyebrow={<><Building2 className="size-3.5" />{t("Portfolio", "পোর্টফোলিও")}</>}
      title={t("Projects", "প্রজেক্ট")}
      subtitle={t("Every building on the drawing board: what is sold, how far it is built, and whether its papers are in order.", "প্রতিটি ভবন এক জায়গায়: কত বিক্রি হয়েছে, কত দূর নির্মিত, আর কাগজপত্র ঠিক আছে কি না।")}
      actions={can(ROLES.MANAGERS) && <Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>{t("New project", "নতুন প্রজেক্ট")}</Button>}
    >
      {/* site ledger strip */}
      <motion.div variants={rise} className="mb-6 grid grid-cols-2 overflow-hidden rounded-2xl border-2 border-ink bg-card sm:grid-cols-4">
        {[
          { label: t("Projects", "প্রজেক্ট"), value: totals.projects },
          { label: t("Flats in all", "মোট ফ্ল্যাট"), value: totals.flats },
          { label: t("Flats sold", "বিক্রিত ফ্ল্যাট"), value: totals.sold },
          { label: t("Open for sale", "বিক্রি চলছে"), value: totals.open },
        ].map((s, i) => (
          <div key={s.label} className={cn("px-5 py-4", i > 0 && "sm:border-l border-ink/15", i % 2 === 1 && "border-l border-ink/15", i > 1 && "border-t border-ink/15 sm:border-t-0")}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">{s.label}</div>
            <CountUp value={s.value} format={(v) => n(Math.round(v))} className="mt-1 block text-3xl font-bold tracking-tight" />
          </div>
        ))}
      </motion.div>

      {error ? (
        <Empty icon={<FileWarning />} title={error.message} />
      ) : loading && !projects.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[420px]" />)}</div>
      ) : projects.length === 0 ? (
        <Card><Empty icon={<Building2 />} title={t("No projects yet", "এখনো কোনো প্রজেক্ট নেই")}
          hint={t("Create the first project, then add its land, flats and estimate.", "প্রথম প্রজেক্ট তৈরি করুন, তারপর জমি, ফ্ল্যাট ও এস্টিমেট যোগ করুন।")}
          action={can(ROLES.MANAGERS) && <Button icon={<Plus className="size-4" />} onClick={() => setCreate(true)}>{t("New project", "নতুন প্রজেক্ট")}</Button>} /></Card>
      ) : (
        <motion.div variants={stagger} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p, i) => <ProjectCard key={p.id} p={p} flats={flatsByProject.get(p.id) ?? []} index={i} />)}
        </motion.div>
      )}

      <ProjectFormModal open={create} onClose={() => setCreate(false)} onSaved={(p) => router.push(`/projects/${p.id}`)} />
    </Page>
  );
}

function ProjectCard({ p, flats, index }: { p: Project; flats: TowerFlat[]; index: number }) {
  const { t, n, pct, date } = useT();
  const progress = num(p.progress);
  const floors = Math.max(p.storeys - 1, 0);
  return (
    <motion.div variants={rise}>
      <Link href={`/projects/${p.id}`} className="group block h-full">
        <Card hover className="flex h-full flex-col overflow-hidden">
          {/* the drawing */}
          <div className="bg-grid relative flex items-end justify-center gap-3 border-b border-line bg-paper-deep/60 px-6 pb-0 pt-6">
            <span className="absolute left-4 top-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-brick">{p.code}</span>
            <span className="absolute right-4 top-3.5"><StatusBadge group="project" value={p.status} /></span>
            {/* dimension line, as on an elevation drawing */}
            <div className="mb-4 flex h-[170px] flex-col items-center justify-between text-[10px] font-semibold text-mute">
              <span className="h-px w-3 bg-ink/50" />
              <span className="relative flex-1 border-l border-dashed border-ink/40">
                <span className="tnum absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap bg-[#efeadd] px-1">
                  {floors > 0 ? `G+${n(floors)}` : t("Storeys not set", "তলা নির্ধারিত নয়")}
                </span>
              </span>
              <span className="h-px w-3 bg-ink/50" />
            </div>
            <motion.div className="transition-transform duration-300 group-hover:-translate-y-1">
              <Tower flats={flats} storeys={p.storeys} built={progress} width={150} height={196} delay={0.15 + index * 0.12} label={p.name} />
            </motion.div>
            <div className="mb-5 ml-1 self-end">
              <Ring value={progress} size={70} stroke={7} color="var(--color-ink)" delay={0.3 + index * 0.12}>
                <span className="tnum text-sm font-bold">{pct(progress)}</span>
              </Ring>
              <div className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">{t("Built", "নির্মিত")}</div>
            </div>
          </div>

          {/* the facts */}
          <div className="flex flex-1 flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight">{p.name}</h2>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-mute"><MapPin className="size-3.5 shrink-0" />{p.location || t("Location not set", "এলাকা দেওয়া হয়নি")}</p>
              </div>
              <ArrowUpRight className="mt-1 size-5 shrink-0 text-mute transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brick" />
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="text-mute">{t("Flats sold", "ফ্ল্যাট বিক্রি")}</span>
                <span className="tnum font-semibold">{n(p.flats_sold)} <span className="font-normal text-mute">/ {n(p.flats_total)}</span></span>
              </div>
              <Bar value={p.flats_sold} max={Math.max(p.flats_total, 1)} tone="brass" delay={0.2 + index * 0.1} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {p.sales_open
                ? <Badge tone="leaf" dot><ShoppingBag className="size-3" />{t("Sales open", "বিক্রি চলছে")}</Badge>
                : <Badge tone="neutral"><Lock className="size-3" />{t("Sales closed", "বিক্রি বন্ধ")}</Badge>}
              {p.documents_pending > 0 && (
                <Badge tone="brass"><FileWarning className="size-3" />{t(`${p.documents_pending} documents pending`, `${n(p.documents_pending)}টি ডকুমেন্ট বাকি`)}</Badge>
              )}
            </div>

            <div className="mt-auto flex items-center gap-1.5 pt-4 text-xs text-mute">
              <CalendarDays className="size-3.5" />
              {t("Handover", "হস্তান্তর")} <span className="font-medium text-ink-soft">{p.expected_handover ? date(p.expected_handover) : "—"}</span>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
