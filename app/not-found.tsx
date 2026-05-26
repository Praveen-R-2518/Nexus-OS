import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center border border-dashed border-black bg-ref-mint px-4 py-16 text-center dark:border-white dark:bg-[#080c10]">
      <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-black/55 dark:text-white/50">
        Nexus OS
      </p>
      <h1 className="mt-6 font-sans text-4xl font-black tabular-nums tracking-tighter text-black dark:text-white">
        404
      </h1>
      <p className="mx-auto mt-4 max-w-md font-mono text-sm leading-relaxed text-black/75 dark:text-white/70">
        This route is not mapped in the command center. Verify the path or return to a known node.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard"
          prefetch={true}
          className="cursor-pointer border border-black bg-[#0f2336] px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-white transition hover:bg-[#172f45] dark:border-white"
        >
          Command center
        </Link>
        <Link
          href="/login"
          className="cursor-pointer border border-black bg-white px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-black transition hover:bg-[#e3eef6] dark:border-white dark:bg-[#0a1018] dark:text-white dark:hover:bg-white/5"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
