"use client";

import { Calculator, Crown, HardHat, Megaphone, Pencil, ShieldCheck, ShoppingCart, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { LABELS, StatusBadge } from "@/components/forms";
import { useWhen } from "@/components/finance-parts";
import { Avatar, Badge, Button, Card, ErrorNote, Field, Input, Modal, Select, Skeleton, cn, rise, stagger, useAction } from "@/components/ui";
import { api, refreshAll, useList } from "@/lib/api";
import { ROLES, useAuth, type Role, type User } from "@/lib/auth";
import { useT } from "@/lib/i18n";

type Row = User & { last_login: string | null };

const ROLE_INFO: { role: Role; icon: typeof Crown; band: string; en: string; bn: string }[] = [
  { role: "OWNER", icon: Crown, band: "bg-brick", en: "Everything — approvals, land registration, handover, user management.", bn: "সবকিছু — অনুমোদন, জমি রেজিস্ট্রি, হস্তান্তর, ইউজার ব্যবস্থাপনা।" },
  { role: "ADMIN", icon: ShieldCheck, band: "bg-ink", en: "Same reach as the owner, for day-to-day administration.", bn: "মালিকের মতোই প্রবেশাধিকার, দৈনন্দিন প্রশাসনের জন্য।" },
  { role: "ACCOUNTS", icon: Calculator, band: "bg-leaf", en: "Receives and pays money, posts bills, expenses and vouchers, sees every report.", bn: "টাকা গ্রহণ ও পরিশোধ, বিল-খরচ-ভাউচার পোস্ট, সব রিপোর্ট দেখা।" },
  { role: "SALES", icon: Megaphone, band: "bg-sky", en: "Leads, customers and bookings. Cannot take money or see cost and profit.", bn: "লিড, ক্রেতা ও বুকিং। টাকা নিতে বা খরচ-লাভ দেখতে পারে না।" },
  { role: "ENGINEER", icon: HardHat, band: "bg-brass", en: "Site progress, work packages, estimates and purchase orders. No payments.", bn: "সাইটের অগ্রগতি, কাজের অংশ, এস্টিমেট ও পারচেজ অর্ডার। পেমেন্ট নয়।" },
  { role: "PURCHASE", icon: ShoppingCart, band: "bg-plum", en: "Vendors, purchase orders, receiving goods and recording bills. No payments.", bn: "সরবরাহকারী, পারচেজ অর্ডার, মাল গ্রহণ ও বিল রেকর্ড। পেমেন্ট নয়।" },
];

export function Users() {
  const { t, n } = useT();
  const { can, user: me } = useAuth();
  const canEdit = can(ROLES.MANAGERS);
  const { rows, loading } = useList<Row>("/users?page_size=200");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const when = useWhen();

  return (
    <div className="space-y-5">
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ROLE_INFO.map((r) => {
          const count = rows.filter((u) => u.role === r.role && u.is_active).length;
          const Icon = r.icon;
          return (
            <motion.div key={r.role} variants={rise}>
              <Card hover className="relative h-full overflow-hidden p-4 pl-5">
                <span className={cn("absolute inset-y-0 left-0 w-1.5", r.band)} />
                <div className="flex items-center gap-2.5">
                  <Icon className="size-[18px] text-ink-soft" />
                  <h3 className="font-semibold">{t(LABELS.role[r.role].en, LABELS.role[r.role].bn)}</h3>
                  <span className="tnum ml-auto rounded-full bg-paper-deep px-2 py-0.5 text-xs font-medium">{n(count)}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-snug text-mute">{t(r.en, r.bn)}</p>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div><h2 className="text-[15px] font-semibold">{t("People", "ইউজার")}</h2><p className="text-[13px] text-mute">{canEdit ? t("Give each person their own sign-in; never share one.", "প্রত্যেককে আলাদা সাইন-ইন দিন; কখনো ভাগাভাগি নয়।") : t("Only the owner or an administrator can change users.", "শুধু মালিক বা অ্যাডমিন ইউজার বদলাতে পারেন।")}</p></div>
          {canEdit && <Button icon={<UserPlus className="size-4" />} onClick={() => setEditing("new")}>{t("Add user", "ইউজার যোগ করুন")}</Button>}
        </div>
        {loading ? <div className="space-y-2 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div> : (
          <ul className="divide-y divide-line/70">
            {rows.map((u, i) => (
              <motion.li key={u.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition hover:bg-paper-deep/50", !u.is_active && "opacity-55")}>
                <Avatar name={u.display_name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="truncate font-medium">{u.display_name}</span>{u.id === me?.id && <Badge tone="brass">{t("You", "আপনি")}</Badge>}{!u.is_active && <Badge tone="neutral">{t("Disabled", "নিষ্ক্রিয়")}</Badge>}</div>
                  <div className="truncate text-xs text-mute"><span className="tnum">@{u.username}</span>{u.designation ? ` · ${u.designation}` : ""}{u.phone ? ` · ${u.phone}` : ""}</div>
                </div>
                <StatusBadge group="role" value={u.role} dot={false} />
                <span className="w-32 text-right text-xs text-mute">{u.last_login ? <>{t("Last seen", "সর্বশেষ")} {when(u.last_login)}</> : t("Never signed in", "কখনো সাইন-ইন করেননি")}</span>
                {canEdit && <button onClick={() => setEditing(u)} aria-label={t("Edit user", "ইউজার সম্পাদনা")} className="grid size-8 place-items-center rounded-lg text-mute transition hover:bg-paper-deep hover:text-ink"><Pencil className="size-4" /></button>}
              </motion.li>
            ))}
          </ul>
        )}
      </Card>
      <UserModal target={editing} onClose={() => setEditing(null)} selfId={me?.id} />
    </div>
  );
}

function UserModal({ target, onClose, selfId }: { target: Row | "new" | null; onClose: () => void; selfId?: number }) {
  const { t } = useT();
  const { busy, error, run, setError } = useAction();
  const editing = target && target !== "new" ? target : null;
  const [f, setF] = useState({ username: "", first_name: "", last_name: "", email: "", phone: "", designation: "", role: "SALES" as Role, password: "", is_active: true });
  useEffect(() => {
    if (!target) return;
    setError("");
    setF(editing ? { username: editing.username, first_name: editing.first_name, last_name: editing.last_name, email: editing.email, phone: editing.phone, designation: editing.designation, role: editing.role, password: "", is_active: editing.is_active }
      : { username: "", first_name: "", last_name: "", email: "", phone: "", designation: "", role: "SALES", password: "", is_active: true });
  }, [target, editing, setError]);

  const self = editing?.id === selfId;
  const valid = f.username.trim() && f.first_name.trim() && (editing ? f.password === "" || f.password.length >= 6 : f.password.length >= 6);

  async function save() {
    const { password, ...rest } = f;
    const body = { ...rest, username: f.username.trim(), ...(password ? { password } : {}) };
    const ok = await run(async () => {
      if (editing) await api.patch(`/users/${editing.id}`, body);
      else await api.post("/users", body);
      await refreshAll();
      return true;
    }, editing ? t("User updated", "ইউজার আপডেট হয়েছে") : t("User added", "ইউজার যোগ হয়েছে"));
    if (ok) onClose();
  }

  return (
    <Modal open={!!target} onClose={onClose} size="lg" title={editing ? t("Edit user", "ইউজার সম্পাদনা") : t("Add user", "ইউজার যোগ করুন")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Cancel", "বাতিল")}</Button><Button loading={busy} disabled={!valid} onClick={save}>{t("Save", "সেভ করুন")}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("First name", "নামের প্রথম অংশ")} required><Input autoFocus value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
          <Field label={t("Last name", "নামের শেষ অংশ")}><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
          <Field label={t("Username", "ইউজারনেম")} required hint={t("Used to sign in. Letters, digits and . _ - only.", "সাইন-ইনের জন্য। শুধু অক্ষর, সংখ্যা ও . _ -")}><Input autoComplete="off" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.replace(/[^\w.@+-]/g, "") })} /></Field>
          <Field label={editing ? t("New password", "নতুন পাসওয়ার্ড") : t("Password", "পাসওয়ার্ড")} required={!editing} hint={editing ? t("Leave empty to keep the current one.", "বর্তমানটি রাখতে ফাঁকা রাখুন।") : t("At least 6 characters.", "কমপক্ষে ৬ অক্ষর।")}>
            <Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
          <Field label={t("Designation", "পদবি")}><Input value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} /></Field>
          <Field label={t("Phone", "ফোন")}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label={t("Email", "ইমেইল")}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label={t("Role", "রোল")} required hint={self ? t("You cannot change your own role.", "নিজের রোল নিজে বদলানো যায় না।") : undefined}>
            <Select value={f.role} disabled={self} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              {ROLE_INFO.map((r) => <option key={r.role} value={r.role}>{t(LABELS.role[r.role].en, LABELS.role[r.role].bn)}</option>)}
            </Select>
          </Field>
        </div>
        <p className="rounded-xl bg-paper-deep/70 px-3.5 py-2.5 text-[13px] text-ink-soft">{t(ROLE_INFO.find((r) => r.role === f.role)!.en, ROLE_INFO.find((r) => r.role === f.role)!.bn)}</p>
        {editing && !self && (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" className="size-4 accent-brick" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
            {t("Can sign in", "সাইন-ইন করতে পারবে")}
          </label>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  );
}
