"use client";

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
import type { Conversation, DailyReport } from "@/types";

type ReportResponse = {
  report: DailyReport | null;
  generated_at?: string;
  error?: string;
};

type ConversationsResponse = {
  data?: Conversation[];
  error?: string;
};

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
    return "border-emerald-500/10 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.09]";
  }
  if (status === "rejected") {
    return "border-red-500/10 bg-red-500/[0.06] hover:bg-red-500/[0.09]";
  }
  return "border-yellow-500/10 bg-yellow-500/[0.05] hover:bg-yellow-500/[0.08]";
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (!/[",\n\r]/.test(str)) {
    return str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function TypewriterSummary({ text }: { text: string }) {
  const [visibleText, setVisibleText] = useState("");

  useEffect(() => {
    setVisibleText("");
    if (!text) return;

    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleText(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(timer);
      }
    }, 14);

    return () => window.clearInterval(timer);
  }, [text]);

  return (
    <p className="whitespace-pre-line text-base leading-8 text-gray-200">
      {visibleText}
      {visibleText.length < text.length ? (
        <span className="ml-0.5 animate-pulse text-emerald-300">|</span>
      ) : null}
    </p>
  );
}

export default function ReportPage() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("estimated_value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      setLoading(true);
      setError(null);

      try {
        const [reportRes, conversationsRes] = await Promise.all([
          fetch("/api/report"),
          fetch("/api/conversations?limit=100"),
        ]);

        const reportJson = (await reportRes.json()) as ReportResponse;
        const conversationsJson =
          (await conversationsRes.json()) as ConversationsResponse;

        if (!reportRes.ok) {
          throw new Error(reportJson.error ?? reportRes.statusText);
        }
        if (!conversationsRes.ok) {
          throw new Error(conversationsJson.error ?? conversationsRes.statusText);
        }
        if (!Array.isArray(conversationsJson.data)) {
          throw new Error("Invalid conversations response");
        }

        if (!cancelled) {
          setReport(reportJson.report ?? null);
          setConversations(conversationsJson.data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load report");
          setReport(null);
          setConversations([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, []);

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

      if (sortKey === "estimated_value") {
        aValue = Number(a.estimated_value) || 0;
        bValue = Number(b.estimated_value) || 0;
      } else if (sortKey === "urgency") {
        aValue = a.urgency ? urgencyRank[a.urgency] : 0;
        bValue = b.urgency ? urgencyRank[b.urgency] : 0;
      } else {
        aValue = String(a[sortKey]).toLowerCase();
        bValue = String(b[sortKey]).toLowerCase();
      }

      if (aValue < bValue) return -1 * direction;
      if (aValue > bValue) return 1 * direction;
      return a.created_at.localeCompare(b.created_at) * -1;
    });
  }, [sortDirection, sortKey, todaysRows]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((currentKey) => {
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
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden>
        <div className="absolute -left-24 top-4 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute right-0 top-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative space-y-8">
        <header className="flex flex-col gap-5 border-b border-gray-800/80 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400/90">
              Revenue Recovery Intelligence
            </p>
            <h1 className="mt-2 bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
              Daily Buy-Back Report
            </h1>
            <p className="mt-3 text-sm text-gray-400">{reportDateLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-300">
              <Sparkles className="h-4 w-4" />
              Generated by AI
            </span>
            {report?.created_at ? (
              <span className="text-xs text-gray-500">
                Generated {new Date(report.created_at).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[132px] animate-pulse rounded-xl border border-gray-800 bg-gray-800/40"
              />
            ))}
          </div>
        ) : !report ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-100">
                  No report generated yet today.
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Reports are generated daily at 9 AM.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section
              aria-label="Report KPI summary"
              className="grid gap-4 sm:grid-cols-3"
            >
              <Card
                title="Messages Processed"
                value={report.messages_processed}
                subtitle="customer conversations analyzed"
                accent="text-blue-300"
                icon={<MessageSquareText className="text-blue-300" />}
                className="border-gray-700/80 bg-gradient-to-br from-gray-800 to-gray-800/60"
              />
              <Card
                title="Revenue Recovered"
                value={formatCurrency(revenueRecovered)}
                subtitle="approved conversations value"
                accent="text-emerald-300"
                icon={<CheckCircle2 className="text-emerald-300" />}
                className="border-gray-700/80 bg-gradient-to-br from-gray-800 to-gray-800/60"
              />
              <Card
                title="Drafts Approved"
                value={report.drafts_approved}
                subtitle="human-approved AI responses"
                accent="text-violet-300"
                icon={<FileText className="text-violet-300" />}
                className="border-gray-700/80 bg-gradient-to-br from-gray-800 to-gray-800/60"
              />
            </section>

            <section aria-labelledby="executive-summary" className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-emerald-300" />
                <h2
                  id="executive-summary"
                  className="text-xl font-semibold text-gray-100"
                >
                  Executive Summary
                </h2>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-gray-900/90 via-gray-900/80 to-emerald-950/20 p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
                <TypewriterSummary text={report.summary_text} />
              </div>
            </section>

            <section
              aria-labelledby="conversation-breakdown"
              className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
            >
              <div className="flex flex-col gap-3 border-b border-gray-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    id="conversation-breakdown"
                    className="text-lg font-semibold text-gray-100"
                  >
                    Today&apos;s Conversation Breakdown
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {todaysRows.length} conversations included in this report.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={sortedRows.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800/50 disabled:text-gray-500"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-800">
                  <thead className="bg-gray-950/50">
                    <tr>
                      {[
                        ["customer_name", "Customer"],
                        ["intent", "Intent"],
                        ["urgency", "Urgency"],
                        ["estimated_value", "Value"],
                        ["status", "Status"],
                        ["action", "Action Taken"],
                      ].map(([key, label]) => (
                        <th key={key} scope="col" className="px-4 py-3 text-left">
                          <button
                            type="button"
                            onClick={() => handleSort(key as SortKey)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 transition-colors hover:text-gray-200"
                          >
                            {label}
                            <ArrowUpDown
                              className={cn(
                                "h-3.5 w-3.5",
                                sortKey === key
                                  ? "text-emerald-300"
                                  : "text-gray-600",
                              )}
                            />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/80">
                    {sortedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm text-gray-500"
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
                              <p className="font-medium text-gray-100">
                                {row.customer_name}
                              </p>
                              {row.customer_email ? (
                                <p className="text-xs text-gray-500">
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
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold tabular-nums text-emerald-300">
                            {formatCurrency(row.estimated_value)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <Badge
                              variant="status"
                              value={row.status}
                              label={labelize(row.status)}
                            />
                          </td>
                          <td className="min-w-[220px] px-4 py-3 text-sm text-gray-300">
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
        )}
      </div>
    </div>
  );
}
