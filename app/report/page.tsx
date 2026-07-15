"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ExecutiveEmptyState } from "@/components/ui/ExecutiveEmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { cn, formatCurrency } from "@/lib/utils";
import { aiUsageQuery, conversationsQuery, dailyReportQuery } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import type { Conversation } from "@/types";

type SortKey =
  | "customer_name"
  | "intent"
  | "urgency"
  | "estimated_value"
  | "status"
  | "action";

type SortDirection = "asc" | "desc";

type TableRow = Conversation & {
  action: string;
};

const urgencyRank: Record<NonNullable<Conversation["urgency"]>, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function formatReportDate(dateStr?: string): string {
  const date = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "Report date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function labelize(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isSameReportDay(conversationDate: string, reportDate: string): boolean {
  const conversation = new Date(conversationDate);
  const report = new Date(reportDate);
  if (Number.isNaN(conversation.getTime()) || Number.isNaN(report.getTime())) {
    return false;
  }

  return conversation.toDateString() === report.toDateString();
}

function actionTaken(status: Conversation["status"]): string {
  switch (status) {
    case "approved":
      return "Reply approved";
    case "sent":
      return "Reply sent";
    case "rejected":
      return "Draft rejected";
    case "draft_ready":
      return "Draft awaiting approval";
    case "classified":
      return "AI classified";
    case "new":
      return "Queued for triage";
    default:
      return "Pending review";
  }
}

function rowTone(status: Conversation["status"]): string {
  if (status === "approved" || status === "sent") {
    return "bg-status-positive-surface/30 hover:bg-status-positive-surface/45 dark:hover:bg-status-positive-surface/20";
  }
  if (status === "rejected") {
    return "bg-status-critical-surface/30 hover:bg-status-critical-surface/45 dark:hover:bg-status-critical-surface/20";
  }
  return "bg-status-caution-surface/25 hover:bg-status-caution-surface/40 dark:hover:bg-status-caution-surface/15";
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (!/[",\n\r]/.test(str)) {
    return str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function TypewriterSummary({ text }: { text: string | null | undefined }) {
  const safeText = text ?? "";
  const [visibleText, setVisibleText] = useState("");

  useEffect(() => {
    setVisibleText("");
    if (!safeText) return;

    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleText(safeText.slice(0, index));
      if (index >= safeText.length) {
        window.clearInterval(timer);
      }
    }, 14);

    return () => window.clearInterval(timer);
  }, [safeText]);

  return (
    <p className="whitespace-pre-line font-mono text-sm leading-relaxed text-atmospheric-grey">
      {visibleText}
      {safeText.length > 0 && visibleText.length < safeText.length ? (
        <span className="ml-0.5 animate-pulse text-status-positive">|</span>
      ) : null}
    </p>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

/**
 * Current-month AI usage + soft budget alert (business_profiles.ai_monthly_token_budget).
 * Alert-only: warns at 80% and over budget — nothing is ever blocked.
 */
function AiUsageCard({
  teamId,
  enabled,
}: {
  teamId: string | null;
  enabled: boolean;
}) {
  const { data: usage } = useQuery({
    queryKey: queryKeys.aiUsage(teamId),
    queryFn: aiUsageQuery,
    enabled,
    staleTime: 60_000,
  });

  if (!usage) return null;

  const budget = usage.budget;
  const percent =
    budget && budget > 0 ? Math.round((usage.total_tokens / budget) * 100) : null;
  const overBudget = percent !== null && percent >= 100;
  const nearBudget = percent !== null && percent >= 80 && percent < 100;

  return (
    <section className="app-glass-card rounded-xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-atmospheric-grey">
            AI usage this month
          </h2>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-atmospheric-grey">
            {formatTokens(usage.total_tokens)}
            <span className="ml-1 text-sm font-normal text-muted">tokens</span>
          </p>
        </div>
        {percent !== null ? (
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              overBudget
                ? "border-status-critical-border bg-status-critical-surface text-status-critical"
                : nearBudget
                  ? "border-status-warning-border bg-status-warning-surface text-status-warning"
                  : "border-glass-border text-muted",
            )}
          >
            {percent}% of {formatTokens(budget as number)} budget
          </span>
        ) : (
          <span className="text-xs text-muted">
            No budget set — add one in Settings → AI &amp; Approval Rules.
          </span>
        )}
      </div>

      {percent !== null ? (
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-glass"
          role="progressbar"
          aria-valuenow={Math.min(percent, 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="AI budget used"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
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
      {overBudget ? (
        <p className="mt-2 text-xs text-status-critical">
          Over the soft monthly budget. Sends are never blocked — review usage below or raise
          the budget in Settings.
        </p>
      ) : nearBudget ? (
        <p className="mt-2 text-xs text-status-warning">
          Approaching the monthly budget ({percent}%).
        </p>
      ) : null}

      {usage.rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th className="border-b border-glass-border px-2 py-1.5 font-semibold">
                  Workflow
                </th>
                <th className="border-b border-glass-border px-2 py-1.5 font-semibold">
                  Model
                </th>
                <th className="border-b border-glass-border px-2 py-1.5 text-right font-semibold">
                  Input
                </th>
                <th className="border-b border-glass-border px-2 py-1.5 text-right font-semibold">
                  Output
                </th>
                <th className="border-b border-glass-border px-2 py-1.5 text-right font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {usage.rows.map((row) => (
                <tr key={`${row.workflow_name}:${row.model}`}>
                  <td className="border-b border-glass-border/50 px-2 py-1.5 text-atmospheric-grey">
                    {row.workflow_name}
                  </td>
                  <td className="border-b border-glass-border/50 px-2 py-1.5 font-mono text-muted">
                    {row.model}
                  </td>
                  <td className="border-b border-glass-border/50 px-2 py-1.5 text-right tabular-nums text-muted">
                    {formatTokens(row.input_tokens)}
                  </td>
                  <td className="border-b border-glass-border/50 px-2 py-1.5 text-right tabular-nums text-muted">
                    {formatTokens(row.output_tokens)}
                  </td>
                  <td className="border-b border-glass-border/50 px-2 py-1.5 text-right tabular-nums text-atmospheric-grey">
                    {formatTokens(row.total_tokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">
          No AI usage recorded yet this month.
        </p>
      )}
    </section>
  );
}

export default function ReportPage() {
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null;

  const {
    data: report = null,
    isPending: reportPending,
    error: reportErr,
  } = useQuery({
    queryKey: queryKeys.dailyReport(teamId),
    queryFn: dailyReportQuery,
    enabled: queriesEnabled,
    staleTime: 60_000,
  });

  const {
    data: conversations = [],
    isPending: conversationsPending,
    error: conversationsErr,
  } = useQuery({
    queryKey: queryKeys.conversations(teamId, 100),
    queryFn: () => conversationsQuery(100),
    enabled: queriesEnabled,
    staleTime: 30_000,
  });

  const loading = queriesEnabled && (reportPending || conversationsPending);
  const reportErrorMsg =
    reportErr instanceof Error ? reportErr.message : null;
  const conversationsErrorMsg =
    conversationsErr instanceof Error ? conversationsErr.message : null;
  const [columnSortKey, setColumnSortKey] = useState<SortKey>("estimated_value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const todaysRows = useMemo<TableRow[]>(() => {
    const reportDate = report?.report_date;
    const rows = reportDate
      ? conversations.filter((c) => isSameReportDay(c.created_at, reportDate))
      : [];

    return rows.map((c) => ({
      ...c,
      action: actionTaken(c.status),
    }));
  }, [conversations, report]);

  const revenueRecovered = useMemo(() => {
    return todaysRows
      .filter((row) => row.status === "approved")
      .reduce((sum, row) => sum + (Number(row.estimated_value) || 0), 0);
  }, [todaysRows]);

  const sortedRows = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;

    return [...todaysRows].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      if (columnSortKey === "estimated_value") {
        aValue = Number(a.estimated_value) || 0;
        bValue = Number(b.estimated_value) || 0;
      } else if (columnSortKey === "urgency") {
        aValue = a.urgency ? urgencyRank[a.urgency] : 0;
        bValue = b.urgency ? urgencyRank[b.urgency] : 0;
      } else {
        aValue = String(a[columnSortKey]).toLowerCase();
        bValue = String(b[columnSortKey]).toLowerCase();
      }

      if (aValue < bValue) return -1 * direction;
      if (aValue > bValue) return 1 * direction;
      return a.created_at.localeCompare(b.created_at) * -1;
    });
  }, [sortDirection, columnSortKey, todaysRows]);

  const handleSort = useCallback((key: SortKey) => {
    setColumnSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDirection) =>
          currentDirection === "asc" ? "desc" : "asc",
        );
        return currentKey;
      }

      setSortDirection(key === "estimated_value" ? "desc" : "asc");
      return key;
    });
  }, []);

  const handleExportCsv = useCallback(() => {
    const headers = [
      "Customer",
      "Intent",
      "Urgency",
      "Value",
      "Status",
      "Action Taken",
    ];
    const rows = sortedRows.map((row) => [
      row.customer_name,
      labelize(row.intent),
      labelize(row.urgency),
      row.estimated_value,
      labelize(row.status),
      row.action,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daily-buy-back-report-${report?.report_date ?? "latest"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [report?.report_date, sortedRows]);

  const reportDateLabel = formatReportDate(report?.report_date);

  if (tenant.loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 font-mono text-xs uppercase tracking-widest text-muted">
        <Spinner className="h-8 w-8" label="Loading report" />
        <p>Loading daily report…</p>
      </div>
    );
  }

  if (!queriesEnabled && tenant.ready) {
    return (
      <ExecutiveEmptyState
        title="Workspace setup required"
        description="Complete onboarding to view daily buy-back reports for your team."
        icon={<FileText className="shrink-0" aria-hidden />}
        className="min-h-[50vh] app-glass-card"
      />
    );
  }

  return (
    <div className="relative min-h-0 space-y-10">
      <div className="relative space-y-10">
        <header className="flex flex-col gap-5 hairline-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="nexus-meta text-nexus-growth dark:text-nexus-growth">
              Revenue Recovery Intelligence
            </p>
            <h1 className="mt-3 nexus-app-title text-atmospheric-grey">
              Daily Buy-Back Report
            </h1>
            <p className="mt-3 font-mono text-xs text-muted">{reportDateLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex min-h-11 items-center gap-2 border border-status-positive-border bg-status-positive-surface px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-status-positive">
              <Sparkles className="h-4 w-4" />
              Generated by AI
            </span>
            {report?.created_at ? (
              <span className="text-xs text-atmospheric-grey/40">
                Generated {new Date(report.created_at).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </header>

        {reportErrorMsg ? (
          <div className="border border-status-critical-border bg-status-critical-surface px-4 py-3 font-mono text-sm text-status-critical">
            Report: {reportErrorMsg}
          </div>
        ) : null}
        {conversationsErrorMsg ? (
          <div className="border border-status-critical-border bg-status-critical-surface px-4 py-3 font-mono text-sm text-status-critical">
            Conversations: {conversationsErrorMsg}
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="glass-skeleton h-40 animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : report ? (
          <>
            <section
              aria-label="Report KPI summary"
              className="grid gap-4 sm:grid-cols-3"
            >
              <Card
                title="Messages Processed"
                value={report.messages_processed}
                subtitle="customer conversations analyzed"
                accent="text-nexus-discovery"
                icon={<MessageSquareText className="text-nexus-discovery" />}
                className="app-glass-card"
              />
              <Card
                title="Revenue Recovered"
                value={formatCurrency(revenueRecovered)}
                subtitle="approved conversations value"
                accent="text-nexus-growth"
                icon={<CheckCircle2 className="text-nexus-growth" />}
                className="app-glass-card"
              />
              <Card
                title="Drafts Approved"
                value={report.drafts_approved}
                subtitle="human-approved AI responses"
                accent="text-nexus-approval"
                icon={<FileText className="text-nexus-approval" />}
                className="app-glass-card"
              />
            </section>

            <section aria-labelledby="executive-summary" className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-nexus-discovery" />
                <h2
                  id="executive-summary"
                  className="nexus-section-title text-atmospheric-grey"
                >
                  Executive Summary
                </h2>
              </div>
              <div className="rounded-xl border border-nexus-discovery-border bg-nexus-discovery-soft p-5 dark:border-nexus-discovery-border">
                <TypewriterSummary text={report.summary_text} />
              </div>
            </section>

            <section
              aria-labelledby="conversation-breakdown"
              className="app-glass-card overflow-hidden rounded-xl"
            >
              <div className="flex flex-col gap-3 hairline-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    id="conversation-breakdown"
                    className="nexus-section-title text-atmospheric-grey"
                  >
                    Today&apos;s Conversation Breakdown
                  </h2>
                  <p className="mt-1 text-sm text-atmospheric-grey/60">
                    {todaysRows.length} conversations included in this report.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={sortedRows.length === 0}
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-nexus-execution-border bg-nexus-execution-soft px-4 py-2 text-[13px] font-medium tracking-normal text-nexus-execution transition-colors duration-interaction hover:bg-nexus-execution-soft disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-muted"
                >
                  <Download className="h-5 w-5 shrink-0" />
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-base">
                  <thead className="bg-glass/60">
                    <tr className="hairline-b">
                      {[
                        ["customer_name", "Customer"],
                        ["intent", "Intent"],
                        ["urgency", "Urgency"],
                        ["estimated_value", "Value"],
                        ["status", "Status"],
                        ["action", "Action Taken"],
                      ].map(([key, label]) => (
                        <th key={key} scope="col" className="px-5 py-4 text-left">
                          <button
                            type="button"
                            onClick={() => handleSort(key as SortKey)}
                            className="inline-flex min-h-10 cursor-pointer items-center gap-2 px-1 font-mono text-[10px] font-bold uppercase tracking-widest text-muted transition-colors hover:text-atmospheric-grey"
                          >
                            {label}
                            <ArrowUpDown
                              className={cn(
                                "h-4 w-4 shrink-0",
                                columnSortKey === key
                                  ? "text-status-positive"
                                  : "text-muted",
                              )}
                            />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6">
                          <ExecutiveEmptyState
                            title="No conversations found for this report window."
                            description="Adjust filters or check back after new conversations are processed."
                            icon={<MessageSquareText className="shrink-0" aria-hidden />}
                            className="border-none bg-transparent dark:bg-transparent"
                          />
                        </td>
                      </tr>
                    ) : (
                      sortedRows.map((row) => (
                        <tr
                          key={row.id}
                          className={cn(
                            "hairline-b transition-colors last:border-b-0",
                            rowTone(row.status),
                          )}
                        >
                          <td className="whitespace-nowrap px-4 py-3">
                            <div>
                              <p className="font-medium text-atmospheric-grey">
                                {row.customer_name}
                              </p>
                              {row.customer_email ? (
                                <p className="text-xs text-atmospheric-grey/60">
                                  {row.customer_email}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <Badge
                              variant="intent"
                              value={row.intent}
                              label={labelize(row.intent)}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <Badge
                              variant="urgency"
                              value={row.urgency}
                              label={labelize(row.urgency)}
                            />
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-base font-bold tabular-nums text-status-positive">
                            {formatCurrency(row.estimated_value)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <Badge
                              variant="status"
                              value={row.status}
                              label={labelize(row.status)}
                            />
                          </td>
                          <td className="min-w-[220px] px-4 py-3 font-mono text-xs text-muted">
                            {row.action}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : reportErrorMsg ? (
          <div className="border border-status-critical-border bg-status-critical-surface p-6 font-mono text-sm text-status-critical">
            Could not load the daily report. {reportErrorMsg}
          </div>
        ) : (
          <ExecutiveEmptyState
            title="No report generated yet today."
            description="Reports are generated daily at 9 AM."
            icon={<Clock className="shrink-0" aria-hidden />}
            className="app-glass-card"
          />
        )}

        <AiUsageCard teamId={teamId} enabled={queriesEnabled} />
      </div>
    </div>
  );
}
