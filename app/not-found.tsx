import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-trajectory-blue">
        Nexus OS
      </p>
      <h1 className="mt-4 text-4xl font-bold tabular-nums text-atmospheric-grey">404</h1>
      <p className="mt-2 max-w-md text-atmospheric-grey/60">
        This page isn&apos;t part of the command center. Check the URL or use
        the sidebar.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-trajectory-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
        >
          Command Center
        </Link>
        <Link
          href="/login"
          className="glass-button rounded-lg px-4 py-2 text-sm font-medium text-atmospheric-grey/80 transition hover:text-atmospheric-grey"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
