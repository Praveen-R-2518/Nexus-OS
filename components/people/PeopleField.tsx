import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const PEOPLE_CONTROL_CLASS =
  "glass-input h-11 w-full px-3 text-sm text-atmospheric-grey outline-none transition placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60";

export const PEOPLE_TEXTAREA_CLASS =
  "glass-input min-h-[6rem] w-full resize-y px-3 py-2.5 text-sm text-atmospheric-grey outline-none transition placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60";

type PeopleFieldProps = {
  id: string;
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
};

export function PeopleField({
  id,
  label,
  children,
  hint,
  className,
}: PeopleFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-atmospheric-grey">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
