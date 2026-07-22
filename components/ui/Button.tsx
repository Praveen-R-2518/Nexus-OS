import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = solid brand blue; destructive = solid critical red; secondary = solid
   * neutral surface (for lower-emphasis actions that still need to look tappable). */
  variant?: "primary" | "destructive" | "secondary";
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "border border-nexus-approval bg-nexus-approval text-white hover:opacity-90",
  destructive: "border border-status-critical bg-status-critical text-white hover:opacity-90",
  secondary:
    "border border-border-strong bg-surface-muted text-atmospheric-grey hover:bg-surface-elevated",
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors duration-interaction focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
