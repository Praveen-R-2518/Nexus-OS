import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1B6B3A]">
        Nexus OS
      </p>
      <h1 className="mt-4 text-4xl font-bold tabular-nums text-gray-900 dark:text-gray-100">404</h1>
      <p className="mt-2 max-w-md text-gray-500 dark:text-gray-400">
        This page isn&apos;t part of the command center. Check the URL or use
        the sidebar.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          prefetch={true}
          className="rounded-lg bg-trajectory-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
        >
          Command Center
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 transition hover:border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:bg-gray-800"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
