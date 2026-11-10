import Link from "next/link";

export default function NotFound() {
  return (
    <div className="bg-grid grid min-h-dvh place-items-center bg-paper px-6 text-center">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brick">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">This floor has not been built yet</h1>
        <p className="mt-2 text-mute">The page you asked for does not exist. এই পেজটি খুঁজে পাওয়া যায়নি।</p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-[10px] bg-ink px-5 text-sm font-medium text-paper transition hover:bg-ink-soft">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
