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
  "h-11 w-full border border-black bg-white px-3 font-mono text-sm text-black outline-none transition placeholder:text-black/40 focus:ring-1 dark:border-white dark:bg-[#0a1018] dark:text-white dark:placeholder:text-white/40";

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
      <label htmlFor={id} className="block font-mono text-xs font-medium uppercase tracking-widest text-black/85 dark:text-white/80">
        {label}
        {rest.required ? <span className="text-[#8B1A1A] dark:text-red-400"> *</span> : null}
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
            "focus:border-[#0f2336] focus:ring-[#0f2336] dark:focus:border-[#a8bdd4] dark:focus:ring-[#a8bdd4]",
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
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer border border-transparent p-1.5 text-black/45 transition hover:border-black/20 hover:bg-[#eef6fb] hover:text-black dark:text-white/45 dark:hover:border-white/20 dark:hover:bg-white/5 dark:hover:text-white"
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
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0f2336] dark:text-[#a8bdd4]"
            aria-hidden
          />
        ) : null}
      </div>
      {hint && !error ? (
        <p id={`${id}-hint`} className="font-mono text-[10px] uppercase tracking-wider text-black/55 dark:text-white/50">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="font-mono text-xs text-[#8B1A1A] dark:text-red-400" role="alert">
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
      <label htmlFor={id} className="block font-mono text-xs font-medium uppercase tracking-widest text-black/85 dark:text-white/80">
        {label}
        {rest.required ? <span className="text-[#8B1A1A] dark:text-red-400"> *</span> : null}
      </label>
      <select
        id={id}
        className={cn(
          baseInput,
          "cursor-pointer focus:border-[#0f2336] focus:ring-[#0f2336] dark:focus:border-[#a8bdd4] dark:focus:ring-[#a8bdd4]",
          error
            ? "border-red-600/80 focus:border-red-600 focus:ring-red-600/40 dark:border-red-400/70 dark:focus:border-red-400"
            : "",
        )}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p className="font-mono text-xs text-[#8B1A1A] dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
