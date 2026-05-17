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
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
        {rest.required ? <span className="text-[#8B1A1A] dark:text-red-400"> *</span> : null}
      </label>
      <div className="relative">
        {Icon ? (
          <Icon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            aria-hidden
          />
        ) : null}
        <input
          id={id}
          type={inputType}
          className={cn(
            "h-11 w-full rounded-lg border bg-surface-input dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-50 outline-none transition placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:ring-2",
            Icon ? "pl-10" : "",
            isPassword ? "pr-20" : valid || error ? "pr-10" : "",
            error
              ? "border-[#A83232]/60 focus:border-[#A83232] dark:focus:border-[#F87171] focus:ring-[#A83232]/30"
              : "border-slate-200 dark:border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/25",
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
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 dark:text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
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
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1B6B3A] dark:text-emerald-400"
          aria-hidden
        />
      ) : null}
    </div>
    {hint && !error ? (
      <p id={`${id}-hint`} className="text-xs text-slate-500">
        {hint}
      </p>
    ) : null}
    {error ? (
      <p className="text-xs text-[#8B1A1A] dark:text-red-400" role="alert">
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
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
        {rest.required ? <span className="text-[#8B1A1A] dark:text-red-400"> *</span> : null}
      </label>
      <select
        id={id}
        className={cn(
          "h-11 w-full rounded-lg border border-[#D8D5CE] bg-surface-input dark:bg-slate-950 px-3 text-sm text-slate-900 dark:text-slate-50 outline-none transition focus:ring-2",
          error
            ? "border-[#A83232]/60 focus:border-[#A83232] dark:focus:border-[#F87171] focus:ring-[#A83232]/30"
            : "border-slate-200 dark:border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/25",
        )}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p className="text-xs text-[#8B1A1A] dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
