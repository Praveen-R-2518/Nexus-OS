import type { ReactNode } from "react";

export function TableScrollHint({
  children,
  hint = "Swipe sideways for more columns",
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="px-4 pt-3 text-xs text-muted md:hidden">{hint}</p>
      <div className="overflow-x-auto overscroll-x-contain">{children}</div>
    </div>
  );
}
