import { cn } from "@/lib/utils";

export interface SpinnerProps {
  className?: string;
  label?: string;
}

export function Spinner({ className, label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-block h-6 w-6", className)}
    >
      <span
        className={cn(
          "block h-full w-full animate-spin rounded-full border-2 border-border/60 border-t-nexus-approval dark:border-border dark:border-t-nexus-approval",
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
