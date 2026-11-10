"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import * as f from "./format";
import type { Lang } from "./format";

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Inline bilingual string: t("Collected", "আদায়") */
  t: (en: string, bn: string) => string;
  taka: (v: string | number | null | undefined, decimals?: number) => string;
  short: (v: string | number | null | undefined) => string;
  n: (v: string | number | null | undefined, decimals?: number) => string;
  pct: (v: string | number | null | undefined, d?: number) => string;
  date: (d: string | Date | null | undefined) => string;
  month: (d: string | Date | null | undefined, withYear?: boolean) => string;
};

const LangContext = createContext<Ctx | null>(null);
const KEY = "spaceup.lang";

// The chosen language is kept in localStorage and read as an external store,
// so the server render (English) and the first client render agree.
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
const readLang = (): Lang => (window.localStorage.getItem(KEY) === "bn" ? "bn" : "en");

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore<Lang>(subscribe, readLang, () => "en");

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    window.localStorage.setItem(KEY, l);
    listeners.forEach((cb) => cb());
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t: (en, bn) => (lang === "bn" ? bn : en),
      taka: (v, d = 0) => f.taka(v, lang, d),
      short: (v) => f.short(v, lang),
      n: (v, d = 0) => f.group(v, lang, d),
      pct: (v, d = 0) => f.pct(v, lang, d),
      date: (d) => f.fdate(d, lang),
      month: (d, y) => f.fmonth(d, lang, y),
    }),
    [lang, setLang],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useT must be used inside <LangProvider>");
  return ctx;
}
