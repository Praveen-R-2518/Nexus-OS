export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 py-8">
      <div className="h-10 w-48 border border-border/60 bg-surface-muted dark:border-border" />
      <div className="h-32 border border-border/60 bg-surface-muted dark:border-border" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 border border-border/60 bg-surface-muted dark:border-border"
          />
        ))}
      </div>
    </div>
  );
}
