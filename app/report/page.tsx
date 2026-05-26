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
import { cn, formatCurrency } from "@/lib/utils";
import { conversationsQuery, dailyReportQuery } from "@/lib/queries/fetchers";
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
    return "border-status-positive-border/20 bg-status-positive-surface/50 hover:bg-status-positive-surface dark:hover:bg-status-positive-surface/30";
  }
  if (status === "rejected") {
    return "border-status-critical-border/20 bg-status-critical-surface/50 hover:bg-status-critical-surface dark:hover:bg-status-critical-surface/30";
  }
  return "border-status-caution-border/20 bg-status-caution-surface/40 hover:bg-status-caution-surface/80 dark:hover:bg-status-caution-surface/25";
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
    <p className="whitespace-pre-line text-base leading-8 text-gray-700 dark:text-gray-200">
      {visibleText}
      {safeText.length > 0 && visibleText.length < safeText.length ? (
        <span className="ml-0.5 animate-pulse text-status-positive">|</span>
      ) : null}
    </p>
  );
}

export default function ReportPage() {
  const {
    data: report = null,
    isPending: reportPending,
    error: reportErr,
  } = useQuery({
    queryKey: queryKeys.dailyReport(),
    queryFn: dailyReportQuery,
    staleTime: 60_000,
  });

  const {
    data: conversations = [],
    isPending: conversationsPending,
    error: conversationsErr,
  } = useQuery({
    queryKey: queryKeys.conversations(100),
    queryFn: () => conversationsQuery(100),
    staleTime: 30_000,
  });

  const loading = reportPending || conversationsPending;
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

  return (
    <div className="relative min-h-[calc(100vh-6rem)] overflow-hidden">
      <div className="relative space-y-8">
        <header className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-brand text-status-positive sm:text-sm">
              Revenue Recovery Intelligence
            </p>
            <h1 className="mt-2 bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
              Daily Buy-Back Report
            </h1>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{reportDateLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-status-positive-border bg-status-positive-surface px-4 py-2 text-base font-semibold text-status-positive">
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
          <div className="rounded-xl border border-status-critical-border bg-status-critical-surface px-4 py-3 text-base text-status-critical">
            Report: {reportErrorMsg}
          </div>
        ) : null}
        {conversationsErrorMsg ? (
          <div className="rounded-xl border border-status-critical-border bg-status-critical-surface px-4 py-3 text-base text-status-critical">
            Conversations: {conversationsErrorMsg}
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl border border-border bg-surface-muted"
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
                accent="text-blue-600 dark:text-blue-300"
                icon={<MessageSquareText className="text-blue-600 dark:text-blue-300" />}
                className="surface-card"
              />
              <Card
                title="Revenue Recovered"
                value={formatCurrency(revenueRecovered)}
                subtitle="approved conversations value"
                accent="text-status-positive"
                icon={<CheckCircle2 className="text-status-positive" />}
                className="surface-card"
              />
              <Card
                title="Drafts Approved"
                value={report.drafts_approved}
                subtitle="human-approved AI responses"
                accent="text-violet-600 dark:text-violet-300"
                icon={<FileText className="text-violet-600 dark:text-violet-300" />}
                className="surface-card"
              />
            </section>

            <section aria-labelledby="executive-summary" className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-status-positive" />
                <h2
                  id="executive-summary"
                  className="text-xl font-semibold text-gray-900 dark:text-gray-100"
                >
                  Executive Summary
                </h2>
              </div>
              <div className="rounded-2xl border border-status-positive-border/30 bg-status-positive-surface/40 p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] dark:bg-gradient-to-br dark:from-surface-card dark:via-surface-muted dark:to-status-positive-surface/20">
                <TypewriterSummary text={report.summary_text} />
              </div>
            </section>

            <section
              aria-labelledby="conversation-breakdown"
              className="overflow-hidden rounded-2xl border border-border bg-surface-muted/50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] dark:bg-surface-card/40"
            >
              <div className="flex flex-col gap-3 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    id="conversation-breakdown"
                    className="text-lg font-semibold text-gray-900 dark:text-gray-100"
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
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-status-positive-border bg-status-positive-surface px-5 py-2.5 text-base font-semibold text-status-positive transition-colors duration-interaction hover:bg-status-positive-surface/80 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-muted"
                >
                  <Download className="h-5 w-5 shrink-0" />
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-base">
                  <thead className="bg-surface-card">
                    <tr>
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
                            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-1 text-sm font-bold uppercase tracking-brand text-muted transition-colors hover:text-atmospheric-grey"
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
                  <tbody className="divide-y divide-border">
                    {sortedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm text-atmospheric-grey/60"
                        >
                          No conversations found for this report day.
                        </td>
                      </tr>
                    ) : (
                      sortedRows.map((row) => (
                        <tr
                          key={row.id}
                          className={cn(
                            "border-l-2 transition-colors",
                            rowTone(row.status),
                          )}
                        >
                          <td className="whitespace-nowrap px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">
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
                          <td className="min-w-[220px] px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
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
          <div className="rounded-2xl border border-red-500/35 bg-red-500/10 p-8 text-sm text-[#8B1A1A]">
            Could not load the daily report. {reportErrorMsg}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/70 p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  No report generated yet today.
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Reports are generated daily at 9 AM.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
