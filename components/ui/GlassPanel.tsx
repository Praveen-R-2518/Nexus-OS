import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

export function GlassPanel({
  children,
  className,
  as: Component = "div",
}: GlassPanelProps) {
  return (
    <Component className={cn("app-glass-card", className)}>{children}</Component>
  );
}
