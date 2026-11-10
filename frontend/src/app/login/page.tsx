"use client";

import { ArrowRight, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Tower, type TowerFlat } from "@/components/building";
import { Logo } from "@/components/shell";
import { Button, ErrorNote, Field, Input, ease } from "@/components/ui";
import { errorText } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

const DEMO = [
  { user: "owner", en: "Owner", bn: "মালিক" },
  { user: "accounts", en: "Accounts", bn: "হিসাব" },
  { user: "sales", en: "Sales", bn: "বিক্রয়" },
  { user: "engineer", en: "Engineer", bn: "ইঞ্জিনিয়ার" },
];

/** A deterministic little city so the server and browser draw the same skyline. */
function skyline(): { flats: TowerFlat[]; built: number; w: number; h: number }[] {
  const shapes = [
    { floors: 5, units: 2, built: 100, w: 92, h: 150, seed: 3 },
    { floors: 9, units: 3, built: 100, w: 132, h: 250, seed: 7 },
    { floors: 7, units: 2, built: 72, w: 100, h: 200, seed: 5 },
    { floors: 11, units: 3, built: 48, w: 136, h: 300, seed: 11 },
    { floors: 6, units: 2, built: 100, w: 96, h: 172, seed: 2 },
  ];
  return shapes.map((s) => {
    const flats: TowerFlat[] = [];
    for (let f = 1; f <= s.floors; f++)
      for (let u = 0; u < s.units; u++) {
        const r = (f * 31 + u * 17 + s.seed * 13) % 10;
        flats.push({ floor: f, unit: "ABC"[u], status: r < 5 ? "BOOKED" : r < 7 ? "HANDED_OVER" : "AVAILABLE" });
      }
    return { flats, built: s.built, w: s.w, h: s.h };
  });
}

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const { t, lang, setLang } = useT();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const towers = useMemo(() => skyline(), []);
  const demo = process.env.NEXT_PUBLIC_DEMO_LOGINS === "1";

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
      router.replace("/");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      {/* left: the city */}
      <section className="bg-grid-night relative hidden overflow-hidden bg-night text-paper lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-24 top-10 size-[420px] rounded-full bg-brick/25 blur-[120px]" />
        <div className="pointer-events-none absolute -right-20 bottom-40 size-[360px] rounded-full bg-brass/20 blur-[120px]" />
        <div className="relative z-10 p-10">
          <Logo dark animated size={40} />
        </div>
        <div className="relative z-10 mt-6 max-w-xl px-10">
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.2 }} className="text-[44px] font-bold leading-[1.08] tracking-tight">
            {t("Every flat, every taka,", "প্রতিটি ফ্ল্যাট, প্রতিটি টাকা,")}
            <br />
            <span className="text-brass">{t("every floor — in one view.", "প্রতিটি তলা — এক নজরে।")}</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} className="mt-5 max-w-md text-[15px] leading-relaxed text-paper/60">
            {t(
              "From bayna to handover: sales, collections, land payments, construction cost and profit, kept in step by a double-entry ledger.",
              "বায়না থেকে হস্তান্তর পর্যন্ত: বিক্রি, আদায়, জমির পেমেন্ট, নির্মাণ খরচ ও লাভ — ডাবল-এন্ট্রি হিসাবে একসাথে।",
            )}
          </motion.p>
        </div>
        <div className="relative z-10 mt-auto flex items-end justify-center gap-3 px-6">
          {towers.map((tw, i) => (
            <Tower key={i} flats={tw.flats} built={tw.built} width={tw.w} height={tw.h} dark delay={0.5 + i * 0.22} />
          ))}
        </div>
        <div className="relative z-10 h-10 border-t border-paper/40 bg-night-soft" />
      </section>

      {/* right: sign in */}
      <section className="bg-grid relative flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="absolute right-6 top-6 flex rounded-lg border border-line bg-card p-0.5 text-xs font-semibold">
          {(["en", "bn"] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} className={`rounded-md px-3 py-1.5 transition ${lang === l ? "bg-ink text-paper" : "text-mute hover:text-ink"}`}>
              {l === "en" ? "English" : "বাংলা"}
            </button>
          ))}
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo animated size={40} /></div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brick">{t("Welcome back", "স্বাগতম")}</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">{t("Sign in to Space Up", "স্পেস আপ-এ সাইন ইন করুন")}</h2>
          <p className="mt-2 text-sm text-mute">{t("Use the account your administrator gave you.", "অ্যাডমিনের দেওয়া অ্যাকাউন্ট ব্যবহার করুন।")}</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label={t("Username", "ইউজারনেম")}>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
                <Input className="h-11 pl-9" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
            </Field>
            <Field label={t("Password", "পাসওয়ার্ড")}>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
                <Input className="h-11 pl-9" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </Field>
            <ErrorNote>{error && (error.includes("No active account") ? t("Wrong username or password.", "ইউজারনেম বা পাসওয়ার্ড ভুল।") : error)}</ErrorNote>
            <Button type="submit" size="lg" className="w-full" loading={busy} icon={!busy && <ArrowRight className="order-last size-4" />}>
              {t("Sign in", "সাইন ইন")}
            </Button>
          </form>

          {demo && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-8 rounded-2xl border border-dashed border-line bg-card/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mute">{t("Demo accounts", "ডেমো অ্যাকাউন্ট")}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {DEMO.map((d) => (
                  <button key={d.user} type="button" onClick={() => { setUsername(d.user); setPassword("spaceup123"); }}
                    className="rounded-full border border-line bg-card px-3 py-1 text-[13px] font-medium transition hover:border-ink hover:bg-brass-wash">
                    {t(d.en, d.bn)}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
          <p className="mt-8 flex items-center gap-2 text-xs text-mute">
            <ShieldCheck className="size-4 text-leaf" />
            {t("Every entry is balanced and kept permanently — corrections are made by reversal.", "প্রতিটি এন্ট্রি ব্যালেন্সড এবং স্থায়ী — সংশোধন হয় রিভার্সালের মাধ্যমে।")}
          </p>
        </motion.div>
      </section>
    </div>
  );
}
