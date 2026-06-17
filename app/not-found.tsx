import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center border border-dashed border-border bg-ref-mint px-4 py-16 text-center dark:border-border dark:bg-surface-page">
      <p className="nexus-meta text-nexus-discovery dark:text-nexus-discovery">
        Nexus OS
      </p>
      <h1 className="mt-6 nexus-page-title tabular-nums text-black dark:text-white">
        404
      </h1>
      <p className="mx-auto mt-4 max-w-md nexus-body text-black/70 dark:text-white/70">
        This page is not available. Check the path or return to the dashboard.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          prefetch={true}
          className="cursor-pointer rounded-full border border-nexus-approval bg-nexus-approval px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2b82ff] dark:border-nexus-approval"
        >
          Command center
        </Link>
        <Link
          href="/login"
          className="cursor-pointer rounded-full border border-border bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-nexus-discovery-soft dark:border-border dark:bg-surface-card dark:text-white dark:hover:bg-white/5"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
