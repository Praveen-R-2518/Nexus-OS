import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="rounded-t-xl hairline-t bg-white text-black dark:bg-surface-page dark:text-white">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-4 py-10 md:flex-row md:items-center md:px-8">
        <div className="space-y-2 font-mono text-xs text-black/70 dark:text-white/65">
          <p className="font-bold uppercase tracking-[0.28em] text-black dark:text-white">
            Nexus OS
          </p>
          <p className="tabular-nums">
            © {new Date().getFullYear()} — All rights reserved.
          </p>
          <p>Developed by Knurdz 3.0</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 font-mono text-xs uppercase tracking-widest text-black dark:text-white">
          <Link
            href="#"
            className="cursor-pointer underline-offset-4 transition-opacity duration-interaction hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ref-cta focus-visible:ring-offset-0 focus-visible:ring-offset-white dark:focus-visible:ring-border-strong"
          >
            Privacy
          </Link>
          <Link
            href="#"
            className="cursor-pointer underline-offset-4 transition-opacity duration-interaction hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ref-cta focus-visible:ring-offset-0 focus-visible:ring-offset-white dark:focus-visible:ring-border-strong"
          >
            Terms
          </Link>
          <Link
            href="/login"
            className="cursor-pointer underline-offset-4 transition-opacity duration-interaction hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ref-cta focus-visible:ring-offset-0 focus-visible:ring-offset-white dark:focus-visible:ring-border-strong"
          >
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}
