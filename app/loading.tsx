export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 py-8">
      <div className="h-10 w-48 animate-pulse border border-black/15 bg-surface-muted dark:border-white/15" />
      <div className="h-32 animate-pulse border border-black/15 bg-surface-muted dark:border-white/15" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse border border-black/15 bg-surface-muted dark:border-white/15"
          />
        ))}
      </div>
    </div>
  );
}
