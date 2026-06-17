"use client";

import type { LucideIcon } from "lucide-react";
import { Eye, EyeOff, Check } from "lucide-react";
import {
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export type FormInputProps = {
  id: string;
  label: string;
  error?: string;
  icon?: LucideIcon;
  showValid?: boolean;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>;

const baseInput =
  "h-11 w-full rounded-lg border border-border bg-white px-3 text-[15px] text-black outline-none transition placeholder:text-black/40 focus:ring-1 dark:border-border dark:bg-surface-card dark:text-white dark:placeholder:text-white/40";

export default function FormInput({
  id,
  label,
  error,
  icon: Icon,
  className,
  type = "text",
  showValid,
  hint,
  ...rest
}: FormInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;
  const valid = Boolean(showValid && !error && rest.value && String(rest.value).length > 0);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium tracking-normal text-black/85 dark:text-white/80">
        {label}
        {rest.required ? <span className="text-[#8B1A1A] dark:text-status-critical"> *</span> : null}
      </label>
      <div className="relative">
        {Icon ? (
          <Icon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40 dark:text-white/40"
            aria-hidden
          />
        ) : null}
        <input
          id={id}
          type={inputType}
          className={cn(
            baseInput,
            "focus:border-nexus-approval focus:ring-nexus-approval dark:focus:border-nexus-approval dark:focus:ring-nexus-approval",
            Icon ? "pl-10" : "",
            isPassword ? "pr-20" : valid || error ? "pr-10" : "",
            error
              ? "border-red-600/80 focus:border-red-600 focus:ring-red-600/40 dark:border-red-400/70 dark:focus:border-red-400"
              : "",
            className,
          )}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={hint ? `${id}-hint` : undefined}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer border border-transparent p-1.5 text-black/45 transition hover:border-border/70 hover:bg-[rgba(18,116,249,0.06)] hover:text-black dark:text-white/45 dark:hover:border-white/20 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        ) : null}
        {!isPassword && valid ? (
          <Check
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-nexus-intake dark:text-nexus-intake"
            aria-hidden
          />
        ) : null}
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs tracking-normal text-black/55 dark:text-white/50">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-[#8B1A1A] dark:text-status-critical" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormSelect({
  id,
  label,
  error,
  children,
  ...rest
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium tracking-normal text-black/85 dark:text-white/80">
        {label}
        {rest.required ? <span className="text-[#8B1A1A] dark:text-status-critical"> *</span> : null}
      </label>
      <select
        id={id}
        className={cn(
          baseInput,
          "cursor-pointer focus:border-nexus-approval focus:ring-nexus-approval dark:focus:border-nexus-approval dark:focus:ring-nexus-approval",
          error
            ? "border-red-600/80 focus:border-red-600 focus:ring-red-600/40 dark:border-red-400/70 dark:focus:border-red-400"
            : "",
        )}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p className="text-xs text-[#8B1A1A] dark:text-status-critical" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
