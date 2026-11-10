"use client";

import { History, Settings, Tags, UsersRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Guard, Page } from "@/components/shell";
import { Tabs, ease, rise } from "@/components/ui";
import { ROLES } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Activity } from "./activity";
import { CostHeads } from "./heads";
import { Users } from "./users";

type Tab = "users" | "heads" | "log";

export default function SettingsPage() {
  return <Guard roles={ROLES.FINANCE}><SettingsView /></Guard>;
}

function SettingsView() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("users");
  const icon = (I: typeof Tags, label: string) => <span className="flex items-center gap-1.5"><I className="size-4" />{label}</span>;
  return (
    <Page
      eyebrow={<><Settings className="size-3.5" />{t("Administration", "প্রশাসন")}</>}
      title={t("Settings", "সেটিংস")}
      subtitle={t("Who can do what, how costs are classified, and a permanent record of every sensitive action.", "কে কী করতে পারবে, খরচ কীভাবে শ্রেণিবদ্ধ হবে, আর প্রতিটি সংবেদনশীল কাজের স্থায়ী রেকর্ড।")}
    >
      <motion.div variants={rise} className="flex max-w-full">
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[
          { id: "users", label: icon(UsersRound, t("Users & roles", "ইউজার ও রোল")) },
          { id: "heads", label: icon(Tags, t("Cost heads", "খরচের খাত")) },
          { id: "log", label: icon(History, t("Activity log", "কার্যক্রমের লগ")) },
        ]} />
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease }} className="mt-5">
          {tab === "users" && <Users />}
          {tab === "heads" && <CostHeads />}
          {tab === "log" && <Activity />}
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}
