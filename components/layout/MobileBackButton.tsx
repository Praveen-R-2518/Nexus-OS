"use client";

import { ArrowLeft } from "lucide-react";

export function MobileBackButton({
  onClick,
  label = "Back",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-atmospheric-grey lg:hidden"
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </button>
  );
}
