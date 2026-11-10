"use client";

import clsx, { type ClassValue } from "clsx";
import { AnimatePresence, animate, motion, useInView, useMotionValue, useTransform, type Variants } from "motion/react";
import { Check, Loader2, TriangleAlert, X } from "lucide-react";
import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cleanMoney, digits, num } from "@/lib/format";
import { useT } from "@/lib/i18n";

export const cn = (...a: ClassValue[]) => clsx(a);

/* ---------- motion presets ---------- */
export const ease = [0.22, 1, 0.36, 1] as const;
export const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } } };
export const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
};
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.4, ease } },
};

/* ---------- buttons ---------- */
type Variant = "primary" | "dark" | "outline" | "ghost" | "danger" | "soft";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brick text-white hover:bg-brick-deep shadow-[0_6px_16px_-8px_var(--color-brick)]",
  dark: "bg-ink text-paper hover:bg-ink-soft",
  outline: "border border-line bg-card text-ink hover:border-ink",
  ghost: "text-ink-soft hover:bg-paper-deep",
  danger: "bg-rose text-white hover:brightness-95",
  soft: "bg-paper-deep text-ink hover:bg-line",
};
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};
export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-[10px] font-medium transition-[background,transform,border-color,filter] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[13px]" : size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ---------- surfaces ---------- */
export function Card({ className, children, hover, ...rest }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-2xl border border-line bg-card shadow-card",
        hover && "transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lift",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint, action }: { children: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-mute">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export type Tone = "neutral" | "brick" | "brass" | "leaf" | "rose" | "sky" | "plum" | "ink";
const TONES: Record<Tone, string> = {
  neutral: "bg-paper-deep text-ink-soft",
  brick: "bg-brick-wash text-brick-deep",
  brass: "bg-brass-wash text-[#8a6410]",
  leaf: "bg-leaf-wash text-leaf",
  rose: "bg-rose-wash text-rose",
  sky: "bg-sky-wash text-sky",
  plum: "bg-plum-wash text-plum",
  ink: "bg-ink text-paper",
};
export function Badge({ tone = "neutral", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium", TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ---------- animated numbers ---------- */
export function CountUp({ value, format, className, duration = 1.1 }: { value: number; format: (n: number) => string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, value, { duration, ease });
    return () => controls.stop();
  }, [inView, value, duration, mv]);
  return <motion.span ref={ref} className={cn("tnum", className)}>{text}</motion.span>;
}

/* ---------- progress ---------- */
export function Bar({ value, max = 100, tone = "brick", className, height = 8, delay = 0 }: { value: number; max?: number; tone?: Tone | "night"; className?: string; height?: number; delay?: number }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill: Record<string, string> = {
    brick: "bg-brick", brass: "bg-brass", leaf: "bg-leaf", rose: "bg-rose", sky: "bg-sky", plum: "bg-plum", ink: "bg-ink", neutral: "bg-mute", night: "bg-night",
  };
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-paper-deep", className)} style={{ height }}>
      <motion.div
        className={cn("h-full rounded-full", fill[tone])}
        initial={{ width: 0 }}
        whileInView={{ width: `${w}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease, delay }}
      />
    </div>
  );
}

export function Ring({ value, size = 72, stroke = 7, color = "var(--color-brick)", track = "var(--color-paper-deep)", children, delay = 0 }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode; delay?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c - (c * v) / 100 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease, delay }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* ---------- feedback ---------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-mute", className)} />;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}
export function PageLoading() {
  return (
    <div className="space-y-5 p-1">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}
export function Empty({ icon, title, hint, action }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 grid size-12 place-items-center rounded-2xl bg-paper-deep text-mute">{icon}</div>}
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-mute">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </motion.div>
  );
}
export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 rounded-xl border border-rose/30 bg-rose-wash px-3 py-2.5 text-sm text-rose">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </motion.div>
  );
}

/* ---------- toast ---------- */
type Toast = { id: number; kind: "ok" | "err"; text: string };
const ToastContext = createContext<{ ok: (t: string) => void; err: (t: string) => void } | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === "ok" ? 3200 : 6000);
  }, []);
  const value = useMemo(() => ({ ok: (t: string) => push("ok", t), err: (t: string) => push("err", t) }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[min(92vw,380px)] flex-col gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id} layout initial={{ opacity: 0, x: 40, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }}
              className={cn("pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm shadow-pop", t.kind === "ok" ? "bg-ink text-paper" : "bg-rose text-white")}
            >
              {t.kind === "ok" ? <Check className="mt-0.5 size-4 shrink-0 text-brass" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
              <span>{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/* ---------- modal ---------- */
export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  const mounted = useIsClient();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!mounted) return null;
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-night/55 backdrop-blur-[3px]" onClick={onClose} />
          <motion.div
            role="dialog" aria-modal="true"
            initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.32, ease }}
            className={cn("relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-card shadow-pop sm:rounded-3xl", width)}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                {subtitle && <p className="mt-0.5 text-sm text-mute">{subtitle}</p>}
              </div>
              <button onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-paper-deep hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper/60 px-6 py-3.5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ---------- form controls ---------- */
const control =
  "h-10 w-full rounded-[10px] border border-line bg-white px-3 text-sm text-ink outline-none transition placeholder:text-mute/60 focus:border-ink focus:ring-4 focus:ring-brass/20 disabled:bg-paper-deep disabled:text-mute";

export function Field({ label, hint, error, required, children, className }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
          {label}
          {required && <span className="ml-0.5 text-brick">*</span>}
        </span>
      )}
      {children}
      {error ? <span className="mt-1 block text-xs text-rose">{error}</span> : hint ? <span className="mt-1 block text-xs text-mute">{hint}</span> : null}
    </label>
  );
}
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(control, className)} />;
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(control, "chevron appearance-none pr-8", className)}>
      {children}
    </select>
  );
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(control, "h-auto min-h-20 py-2.5", className)} />;
}

/** Amount input: keeps a clean decimal string, shows lakh/crore grouping underneath. */
export function MoneyInput({ value, onChange, className, placeholder = "0", ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: string; onChange: (v: string) => void }) {
  const { taka } = useT();
  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-mute">৳</span>
        <input
          {...rest} inputMode="decimal" value={value} placeholder={placeholder}
          onChange={(e) => onChange(cleanMoney(e.target.value))}
          className={cn(control, "tnum pl-7 text-right font-medium", className)}
        />
      </div>
      {num(value) >= 1000 && <span className="mt-1 block text-right text-xs text-mute">{taka(value, value.includes(".") ? 2 : 0)}</span>}
    </div>
  );
}

/* ---------- tabs ---------- */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  const id = useId();
  const { lang } = useT();
  return (
    <div className={cn("scroll-thin flex gap-1 overflow-x-auto rounded-xl border border-line bg-paper-deep/60 p-1", className)}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)} className={cn("relative whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors", active ? "text-paper" : "text-ink-soft hover:text-ink")}>
            {active && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-lg bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="relative z-10 flex items-center gap-1.5">
              {tab.label}
              {tab.count !== undefined && <span className={cn("tnum rounded-full px-1.5 text-[11px]", active ? "bg-paper/20" : "bg-line")}>{digits(String(tab.count), lang)}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- tables ---------- */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("scroll-thin overflow-x-auto", className)}>
      <table className="w-full border-separate border-spacing-0 text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <th className={cn("sticky top-0 whitespace-nowrap border-b border-line bg-paper/80 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute backdrop-blur", right ? "text-right" : "text-left", className)}>{children}</th>;
}
export function Td({ children, right, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) {
  return <td {...rest} className={cn("border-b border-line/70 px-4 py-3 align-middle", right && "tnum text-right", className)}>{children}</td>;
}

/* ---------- small helpers ---------- */
export function Avatar({ name, size = 36, tone }: { name: string; size?: number; tone?: number }) {
  const palette = ["bg-brick text-white", "bg-night text-brass", "bg-brass text-ink", "bg-leaf text-white", "bg-sky text-white", "bg-plum text-white"];
  const idx = tone ?? [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  const letters = name.replace(/^(Md\.?|Dr\.?|Engr\.?|Mrs?\.?)\s+/i, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full font-semibold", palette[idx])} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {letters}
    </span>
  );
}

export function KeyValue({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5 text-sm", className)}>
      <span className="text-mute">{label}</span>
      <span className="tnum text-right font-medium">{children}</span>
    </div>
  );
}

const noopSubscribe = () => () => {};
/** False while rendering on the server and during hydration, true afterwards. */
export function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Re-initialise local state in the very render in which `key` changes
 *  (React's "adjust state while rendering" pattern: no effect, no extra paint). */
export function useOnChange<K>(key: K, run: (key: K) => void) {
  const [prev, setPrev] = useState(key);
  if (!Object.is(prev, key)) {
    setPrev(key);
    run(key);
  }
}
/** Reset a dialog's form each time it opens (or opens for a different record). */
export function useOnOpen(open: boolean, reset: () => void, id: unknown = null) {
  useOnChange(open ? id ?? true : false, (now) => {
    if (now !== false) reset();
  });
}

/** Run an API action with busy + error state; shows a toast on success. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(true);
      setError("");
      try {
        const out = await fn();
        if (success) toast.ok(success);
        return out;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, error, setError, run };
}
