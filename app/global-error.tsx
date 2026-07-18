"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400">
            Nexus OS
          </p>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">
            Something went wrong
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-zinc-400">
            A critical error occurred. Try refreshing, or return to the
            dashboard.
          </p>
          {error.digest ? (
            <p className="mt-3 font-mono text-xs text-zinc-600">
              Ref: {error.digest}
            </p>
          ) : null}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="cursor-pointer rounded-full bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400"
            >
              Try again
            </button>
            <a
              href="/dashboard"
              className="cursor-pointer rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
            >
              Command center
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
