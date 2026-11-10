export type Lang = "en" | "bn";

export function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export function digits(s: string, lang: Lang): string {
  return lang === "bn" ? s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]) : s;
}

/** 1234567.5 → "12,34,567.50" (lakh/crore grouping used in Bangladesh). */
export function group(v: string | number | null | undefined, lang: Lang = "en", decimals = 0): string {
  const n = num(v);
  const s = new Intl.NumberFormat("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
  return digits(s, lang);
}

export function taka(v: string | number | null | undefined, lang: Lang = "en", decimals = 0): string {
  const n = num(v);
  return (n < 0 ? "−" : "") + "৳" + group(Math.abs(n), lang, decimals);
}

/** Compact amount: 1.25 Cr / 42.5 L / 8,500. */
export function short(v: string | number | null | undefined, lang: Lang = "en"): string {
  const n = num(v);
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  let body: string;
  if (a >= 1e7) body = trim(a / 1e7, 2) + (lang === "bn" ? " কোটি" : " Cr");
  else if (a >= 1e5) body = trim(a / 1e5, a >= 1e6 ? 1 : 2) + (lang === "bn" ? " লাখ" : " L");
  else body = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(a);
  return sign + "৳" + digits(body, lang);
}
function trim(n: number, d: number): string {
  return n.toFixed(d).replace(/\.?0+$/, "");
}

export function pct(v: string | number | null | undefined, lang: Lang = "en", d = 0): string {
  return digits(num(v).toFixed(d), lang) + "%";
}

const MONTHS_BN = ["জানু", "ফেব্রু", "মার্চ", "এপ্রি", "মে", "জুন", "জুলাই", "আগ", "সেপ্টে", "অক্টো", "নভে", "ডিসে"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(d: string | Date | null | undefined): [number, number, number] | null {
  if (!d) return null;
  if (d instanceof Date) return [d.getFullYear(), d.getMonth(), d.getDate()];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
}

export function fdate(d: string | Date | null | undefined, lang: Lang = "en"): string {
  const p = parts(d);
  if (!p) return "—";
  const month = (lang === "bn" ? MONTHS_BN : MONTHS_EN)[p[1]];
  return digits(`${p[2]} ${month} ${p[0]}`, lang);
}

export function fmonth(d: string | Date | null | undefined, lang: Lang = "en", withYear = false): string {
  const p = parts(d);
  if (!p) return "";
  const month = (lang === "bn" ? MONTHS_BN : MONTHS_EN)[p[1]];
  return withYear ? digits(`${month} ${String(p[0]).slice(2)}`, lang) : month;
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysFromToday(d: string | null | undefined): number | null {
  const p = parts(d);
  if (!p) return null;
  const t = new Date();
  const a = Date.UTC(p[0], p[1], p[2]);
  const b = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((a - b) / 86400000);
}

export function initials(name: string): string {
  const w = name.replace(/^(Md\.?|Dr\.?|Engr\.?|Mrs?\.?)\s+/i, "").trim().split(/\s+/);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase();
}

/** Keep only a valid money string while typing ("12a3.456" → "123.45"). */
export function cleanMoney(s: string): string {
  const t = s.replace(/[^\d.]/g, "");
  const [a, ...rest] = t.split(".");
  return rest.length ? `${a}.${rest.join("").slice(0, 2)}` : a;
}
