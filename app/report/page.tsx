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
    <div className="relative min-h-0 space-y-10">
      <div className="relative space-y-10">
        <header className="flex flex-col gap-5 hairline-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ref-cta dark:text-muted sm:text-[11px]">
              Revenue Recovery Intelligence
            </p>
            <h1 className="mt-3 font-sans text-3xl font-black uppercase tracking-tighter text-atmospheric-grey sm:text-4xl">
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
                className="h-40 animate-pulse border border-border/60 bg-surface-muted dark:border-border"
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
                accent="text-blue-600 dark:text-muted"
                icon={<MessageSquareText className="text-blue-600 dark:text-muted" />}
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
                accent="text-violet-600 dark:text-muted"
                icon={<FileText className="text-violet-600 dark:text-muted" />}
                className="surface-card"
              />
            </section>

            <section aria-labelledby="executive-summary" className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-status-positive" />
                <h2
                  id="executive-summary"
                  className="font-mono text-sm font-bold uppercase tracking-widest text-atmospheric-grey"
                >
                  Executive Summary
                </h2>
              </div>
              <div className="rounded-xl border border-status-positive-border/40 bg-status-positive-surface/30 p-5 dark:border-status-positive-border/25">
                <TypewriterSummary text={report.summary_text} />
              </div>
            </section>

            <section
              aria-labelledby="conversation-breakdown"
              className="overflow-hidden rounded-xl border border-border bg-white dark:border-border/60 dark:bg-surface-card"
            >
              <div className="flex flex-col gap-3 hairline-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    id="conversation-breakdown"
                    className="text-lg font-black uppercase tracking-tight text-atmospheric-grey"
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
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-status-positive-border bg-status-positive-surface px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-status-positive transition-colors duration-interaction hover:bg-status-positive-surface/80 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-muted"
                >
                  <Download className="h-5 w-5 shrink-0" />
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-base">
                  <thead className="bg-surface-card">
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
          <div className="border border-border bg-ref-mint p-6 dark:border-border dark:bg-surface-page">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-status-caution-border bg-status-caution-surface text-status-caution">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-sans text-lg font-black uppercase tracking-tight text-atmospheric-grey">
                  No report generated yet today.
                </h2>
                <p className="mt-1 font-mono text-xs text-muted">
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
