"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useTenantScope } from "@/components/tenant/TenantScope";

/**
 * Task E.5: surface `TenantScope.error` globally instead of leaving every page to silently fall
 * through to its own "workspace setup required" empty state when the session-context fetch
 * itself failed (network blip, 5xx, etc.) rather than the user simply having no team yet.
 */
export function TenantScopeErrorBanner() {
  const tenant = useTenantScope();
  if (!tenant.error) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 border-b border-status-critical-border bg-status-critical-surface px-4 py-2.5 text-sm text-status-critical md:px-8 lg:px-10"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        Couldn&apos;t load your workspace: {tenant.error}
      </span>
      <button
        type="button"
        onClick={() => void tenant.refetch()}
        className="inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-status-critical-border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide transition hover:opacity-80"
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden />
        Retry
      </button>
    </div>
  );
}
