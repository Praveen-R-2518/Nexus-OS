"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center border border-dashed border-border bg-ref-mint px-4 py-16 text-center dark:border-border dark:bg-surface-page">
      <p className="nexus-meta text-nexus-discovery dark:text-nexus-discovery">
        Nexus OS
      </p>
      <h1 className="mt-6 nexus-page-title text-black dark:text-white">
        Something went wrong
      </h1>
      <p className="mx-auto mt-4 max-w-md nexus-body text-black/70 dark:text-white/70">
        An unexpected error occurred. You can try again or return to the
        dashboard.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-black/40 dark:text-white/40">
          Ref: {error.digest}
        </p>
      ) : null}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="cursor-pointer rounded-full border border-nexus-approval bg-nexus-approval px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#2b82ff] dark:border-nexus-approval"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          prefetch={true}
          className="cursor-pointer rounded-full border border-border bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-nexus-discovery-soft dark:border-border dark:bg-surface-card dark:text-white dark:hover:bg-white/5"
        >
          Command center
        </Link>
      </div>
    </div>
  );
}
