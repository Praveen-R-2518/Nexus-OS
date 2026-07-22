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

const baseInput = "landing-input";

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
      <label htmlFor={id} className="block text-[13px] font-medium tracking-normal text-[#1d1d1f]">
        {label}
        {rest.required ? <span className="text-status-critical"> *</span> : null}
      </label>
      <div className="relative">
        {Icon ? (
          <Icon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86868b]"
            aria-hidden
          />
        ) : null}
        <input
          id={id}
          type={inputType}
          className={cn(
            baseInput,
            Icon ? "pl-10" : "",
            isPassword ? "pr-20" : valid || error ? "pr-10" : "",
            error
              ? "border-red-600/80 focus:border-red-600 focus:ring-red-600/40"
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
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-md border border-transparent p-1.5 text-[#86868b] transition hover:bg-black/[0.03] hover:text-[#1d1d1f]"
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
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--nexus-intake)]"
            aria-hidden
          />
        ) : null}
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-[12px] tracking-normal text-[#86868b]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-[12px] text-status-critical" role="alert">
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
      <label htmlFor={id} className="block text-[13px] font-medium tracking-normal text-[#1d1d1f]">
        {label}
        {rest.required ? <span className="text-status-critical"> *</span> : null}
      </label>
      <select
        id={id}
        className={cn(
          baseInput,
          "cursor-pointer",
          error
            ? "border-red-600/80 focus:border-red-600 focus:ring-red-600/40"
            : "",
        )}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p className="text-[12px] text-status-critical" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
