"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { aiUsageQuery, settingsQuery, updateSettingsMutation } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import { cn } from "@/lib/utils";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function VisualToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Charts in answers"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-nexus-approval" : "bg-surface-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

export function ChatUsageToolbar({
  teamId,
  enabled,
}: {
  teamId: string | null;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();

  const { data: usage } = useQuery({
    queryKey: queryKeys.aiUsage(teamId),
    queryFn: aiUsageQuery,
    enabled,
    staleTime: 60_000,
  });

  const { data: settings } = useQuery({
    queryKey: queryKeys.settings(teamId),
    queryFn: settingsQuery,
    enabled,
    staleTime: 30_000,
  });

  const visualsMutation = useMutation({
    mutationFn: (next: boolean) => updateSettingsMutation({ chat_visuals_enabled: next }),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.settings(teamId), next);
    },
  });

  const budget = usage?.budget ?? null;
  const totalTokens = usage?.total_tokens ?? 0;
  const percent =
    budget && budget > 0 ? Math.round((totalTokens / budget) * 100) : null;
  const overBudget = percent !== null && percent >= 100;
  const nearBudget = percent !== null && percent >= 80 && percent < 100;
  const visualsEnabled = settings?.business_profile?.chat_visuals_enabled ?? true;
  const visualsEditable = !!settings?.editable.ai_rules;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-glass-border bg-glass/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            AI usage this month
          </p>
          <p className="text-sm font-medium tabular-nums text-atmospheric-grey">
            {formatTokens(totalTokens)}
            {budget ? (
              <span className="font-normal text-muted">
                {" "}
                / {formatTokens(budget)} tokens
              </span>
            ) : null}
          </p>
          {percent !== null ? (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                overBudget
                  ? "border-status-critical-border bg-status-critical-surface text-status-critical"
                  : nearBudget
                    ? "border-status-warning-border bg-status-warning-surface text-status-warning"
                    : "border-glass-border text-muted",
              )}
            >
              {percent}%
            </span>
          ) : (
            <Link
              href="/profile#ai-rules"
              className="text-xs font-medium text-nexus-approval underline-offset-4 hover:underline"
            >
              Set budget in Profile
            </Link>
          )}
        </div>
        {percent !== null ? (
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-glass"
            role="progressbar"
            aria-valuenow={Math.min(percent, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="AI budget used"
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                overBudget
                  ? "bg-status-critical"
                  : nearBudget
                    ? "bg-status-warning"
                    : "bg-nexus-growth",
              )}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        ) : null}
      </div>

      <div className="flex min-h-11 shrink-0 items-center gap-3 border-t border-glass-border pt-3 sm:border-t-0 sm:pt-0">
        <BarChart3 className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="text-sm text-atmospheric-grey">Charts in answers</span>
        <VisualToggle
          checked={visualsEnabled}
          disabled={!visualsEditable || visualsMutation.isPending}
          onChange={(next) => visualsMutation.mutate(next)}
        />
      </div>
    </div>
  );
}
