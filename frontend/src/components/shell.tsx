"use client";

import {
  BookOpenCheck, Building2, Calculator, ChartNoAxesCombined, HandCoins, HardHat, LandPlot, LayoutDashboard, LogOut,
  Menu, Settings, ShoppingCart, Users, UserRoundSearch, Wallet, X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { ROLES, useAuth, type Role } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { Avatar, cn, ease, rise, stagger } from "./ui";

/* ---------- brand ---------- */
export function Logo({ dark = false, size = 34, animated = false }: { dark?: boolean; size?: number; animated?: boolean }) {
  const bars = [
    { x: 14, y: 40, w: 36, fill: dark ? "#f3efe5" : "#161a22" },
    { x: 20, y: 28, w: 30, fill: "#d39a2c" },
    { x: 26, y: 16, w: 24, fill: "#c4532f" },
  ];
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="14" fill={dark ? "#1a2030" : "#161a22"} opacity={dark ? 1 : 0.06} />
        {bars.map((b, i) => (
          <motion.rect
            key={i} x={b.x} y={b.y} width={b.w} height={9} rx={2} fill={b.fill}
            initial={animated ? { opacity: 0, y: 14 } : false} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease, delay: 0.15 + i * 0.14 }}
          />
        ))}
      </svg>
      <span className={cn("text-[19px] font-bold leading-none tracking-tight", dark ? "text-paper" : "text-ink")}>
        Space<span className="text-brick"> Up</span>
      </span>
    </span>
  );
}

/* ---------- navigation map ---------- */
type NavItem = { href: string; en: string; bn: string; icon: typeof Building2; roles: Role[] };
type NavGroup = { en: string; bn: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    en: "Overview", bn: "সারসংক্ষেপ",
    items: [
      { href: "/", en: "Dashboard", bn: "ড্যাশবোর্ড", icon: LayoutDashboard, roles: ROLES.ALL },
      { href: "/projects", en: "Projects", bn: "প্রজেক্ট", icon: Building2, roles: ROLES.ALL },
      { href: "/land", en: "Land", bn: "জমি", icon: LandPlot, roles: ROLES.FINANCE },
    ],
  },
  {
    en: "Sales", bn: "বিক্রয়",
    items: [
      { href: "/leads", en: "Leads", bn: "লিড", icon: UserRoundSearch, roles: ROLES.SALES_TEAM },
      { href: "/customers", en: "Customers", bn: "ক্রেতা", icon: Users, roles: ROLES.SALES_TEAM },
      { href: "/bookings", en: "Bookings", bn: "বুকিং", icon: BookOpenCheck, roles: ROLES.SALES_TEAM },
      { href: "/collections", en: "Collections", bn: "আদায়", icon: HandCoins, roles: ROLES.SALES_TEAM },
    ],
  },
  {
    en: "Build", bn: "নির্মাণ",
    items: [
      { href: "/construction", en: "Construction", bn: "নির্মাণ কাজ", icon: HardHat, roles: ROLES.SITE },
      { href: "/procurement", en: "Procurement", bn: "ক্রয় ও বিল", icon: ShoppingCart, roles: ROLES.SITE },
      { href: "/expenses", en: "Expenses", bn: "খরচ", icon: Wallet, roles: ROLES.FINANCE },
    ],
  },
  {
    en: "Finance", bn: "হিসাব",
    items: [
      { href: "/accounts", en: "Accounts", bn: "হিসাবরক্ষণ", icon: Calculator, roles: ROLES.FINANCE },
      { href: "/reports", en: "Reports", bn: "রিপোর্ট", icon: ChartNoAxesCombined, roles: ROLES.FINANCE },
      { href: "/settings", en: "Settings", bn: "সেটিংস", icon: Settings, roles: ROLES.FINANCE },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { user } = useAuth();
  const { t } = useT();
  return (
    <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto px-3 py-2">
      {NAV.map((group) => {
        const items = group.items.filter((i) => user && i.roles.includes(user.role));
        if (!items.length) return null;
        return (
          <div key={group.en}>
            <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-paper/35">{t(group.en, group.bn)}</div>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href} onNavigate={onNavigate}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors",
                        active ? "text-night" : "text-paper/65 hover:bg-white/5 hover:text-paper",
                      )}
                    >
                      {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-brass" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                      <Icon className="relative z-10 size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" strokeWidth={active ? 2.3 : 1.8} />
                      <span className="relative z-10">{t(item.en, item.bn)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function ActiveNav({ onNavigate }: { onNavigate?: () => void }) {
  return <NavLinks pathname={usePathname()} onNavigate={onNavigate} />;
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useT();
  return (
    <div className="bg-grid-night flex h-full flex-col bg-night text-paper">
      <div className="px-6 pb-5 pt-6">
        <Link href="/" onNavigate={onNavigate}><Logo dark animated /></Link>
        <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-paper/35">{t("Real estate ERP", "রিয়েল এস্টেট ইআরপি")}</p>
      </div>
      {/* usePathname needs a Suspense boundary on routes with dynamic params */}
      <Suspense fallback={<NavLinks pathname="" onNavigate={onNavigate} />}>
        <ActiveNav onNavigate={onNavigate} />
      </Suspense>
      <div className="space-y-3 border-t border-night-line p-4">
        <div className="flex rounded-lg bg-white/5 p-0.5 text-xs font-semibold">
          {(["en", "bn"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} className={cn("relative flex-1 rounded-md py-1.5 transition-colors", lang === l ? "text-night" : "text-paper/60 hover:text-paper")}>
              {lang === l && <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-md bg-paper" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              <span className="relative z-10">{l === "en" ? "English" : "বাংলা"}</span>
            </button>
          ))}
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <Avatar name={user.display_name} size={36} tone={2} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user.display_name}</div>
              <div className="truncate text-[11px] text-paper/45">{user.designation || user.role}</div>
            </div>
            <button onClick={logout} title={t("Sign out", "সাইন আউট")} aria-label={t("Sign out", "সাইন আউট")} className="grid size-8 place-items-center rounded-lg text-paper/50 transition hover:bg-white/10 hover:text-paper">
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Splash() {
  return (
    <motion.div
      className="bg-grid fixed inset-0 z-[90] grid place-items-center bg-paper"
      initial={false} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
    >
      <div className="flex flex-col items-center gap-4">
        <Logo size={48} />
        <div className="h-1 w-32 overflow-hidden rounded-full bg-paper-deep">
          <motion.div className="h-full w-1/2 rounded-full bg-brick" animate={{ x: ["-100%", "220%"] }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} />
        </div>
      </div>
    </motion.div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // The page is always rendered (so its shell can be prerendered); a splash
  // covers it until we know who is signed in.
  return (
    <div className="flex min-h-dvh">
      <AnimatePresence>{(loading || !user) && <Splash key="splash" />}</AnimatePresence>
      <aside className="no-print sticky top-0 hidden h-dvh w-[252px] shrink-0 lg:block">
        <SidebarBody />
      </aside>
      <AnimatePresence>
        {drawer && (
          <motion.div className="no-print fixed inset-0 z-[60] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-night/60" onClick={() => setDrawer(false)} />
            <motion.aside className="absolute inset-y-0 left-0 w-[272px]" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ duration: 0.3, ease }}>
              <SidebarBody onNavigate={() => setDrawer(false)} />
              <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-5 grid size-8 place-items-center rounded-lg text-paper/60 hover:bg-white/10">
                <X className="size-4" />
              </button>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="min-w-0 flex-1">
        <div className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-line bg-paper/85 px-4 py-3 backdrop-blur lg:hidden">
          <Logo size={28} />
          <button onClick={() => setDrawer(true)} aria-label="Open menu" className="grid size-9 place-items-center rounded-lg border border-line bg-card">
            <Menu className="size-4" />
          </button>
        </div>
        <main className="bg-grid min-h-dvh">{user ? children : <PageShellPlaceholder>{children}</PageShellPlaceholder>}</main>
      </div>
    </div>
  );
}

/** Before sign-in is confirmed the page still mounts (hidden behind the splash). */
function PageShellPlaceholder({ children }: { children: ReactNode }) {
  return <div aria-hidden className="pointer-events-none">{children}</div>;
}

/* ---------- page frame ---------- */
export function Page({ title, subtitle, eyebrow, actions, children, wide }: {
  title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean;
}) {
  // A fresh navigation gets a fresh page (entry animation, empty forms);
  // browser back/forward restores the page exactly as it was left.
  const { bfcacheId } = useRouter();
  return (
    <motion.div key={bfcacheId} variants={stagger} initial="hidden" animate="show" className={cn("mx-auto w-full px-4 pb-16 pt-6 sm:px-6 lg:px-8 lg:pt-8", wide ? "max-w-[1560px]" : "max-w-[1360px]")}>
      <motion.header variants={rise} className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brick">{eyebrow}</div>}
          <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-[15px] text-mute">{subtitle}</p>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </motion.header>
      {children}
    </motion.div>
  );
}

export function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = useAuth();
  const { t } = useT();
  if (can(roles)) return <>{children}</>;
  return (
    <Page title={t("Not available for your role", "আপনার রোলের জন্য প্রযোজ্য নয়")} subtitle={t("Ask an administrator if you need access to this screen.", "এই স্ক্রিনে প্রবেশ দরকার হলে অ্যাডমিনকে জানান।")}>
      <div />
    </Page>
  );
}
